"""Verificación de integridad de datos post-corrida (Fase 6 del plan de pruebas de
carga/estrés/concurrencia): "no te limites a comprobar HTTP 200 -- después de cada
prueba verificá la integridad de los datos".

Un `POST .../ofertas` que responde `201` no dice nada por sí solo sobre si el Auction
Engine (ADR-004, lock de fila) mantuvo la consistencia bajo la carga concurrente que
`bid_storm` genera a propósito -- este módulo lee el estado final por la API pública
(nunca acceso directo a Postgres, mismo criterio que el resto de `loadtest/`, ver
ADR-042 sección D) y verifica invariantes de negocio reales:

- Exactamente una oferta `accepted` (ganadora vigente) al terminar -- nunca cero (si
  se aceptó al menos una) ni más de una (dos ganadores sería la falla más grave
  posible del lock de ADR-004).
- El monto de esa oferta coincide exactamente con `GET .../ofertas/leading` -- dos
  lecturas independientes del mismo estado no pueden divergir.
- La secuencia histórica de ofertas `accepted`+`outbid` (quién fue "la vigente" en
  cada momento) es estrictamente creciente en monto, y cada salto respeta el
  incremento mínimo del lote -- un salto que no lo respeta es un incremento inválido
  colado bajo carga.
- Ningún id de oferta duplicado (una oferta persistida dos veces por una carrera mal
  resuelta).
- El total de filas persistidas coincide con lo que el generador de carga contó del
  lado del cliente (ninguna oferta que el cliente cree haber enviado se perdió, y
  ninguna aparece de más).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

from loadtest.client_http import HttpClient
from loadtest.config import RunConfig


@dataclass
class IntegrityReport:
    passed: bool
    issues: list[str] = field(default_factory=list)
    total_ofertas: int = 0
    accepted_count: int = 0
    rejected_count: int = 0
    outbid_count: int = 0
    winner_amount: str | None = None
    leading_amount: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "issues": self.issues,
            "total_ofertas": self.total_ofertas,
            "accepted_count": self.accepted_count,
            "rejected_count": self.rejected_count,
            "outbid_count": self.outbid_count,
            "winner_amount": self.winner_amount,
            "leading_amount": self.leading_amount,
        }


async def _fetch_all_ofertas(client: HttpClient, path: str, headers: dict[str, str]) -> list[dict]:
    items: list[dict] = []
    page = 1
    page_size = 100
    while True:
        response = await client.get(
            path, params={"page": page, "page_size": page_size}, headers=headers, label="list_ofertas_history"
        )
        response.raise_for_status()
        body = response.json()
        items.extend(body["items"])
        if len(items) >= body["total"] or not body["items"]:
            break
        page += 1
    return items


async def check_bid_integrity(
    config: RunConfig,
    *,
    admin_token: str,
    remate_id: str,
    lote_id: str,
    base_price: Decimal,
    min_increment: Decimal,
    expected_total: int | None = None,
) -> IntegrityReport:
    headers = {"Authorization": f"Bearer {admin_token}"}
    ofertas_path = f"/remates/{remate_id}/lotes/{lote_id}/ofertas"

    async with HttpClient(config.api_base_url) as client:
        all_ofertas = await _fetch_all_ofertas(client, ofertas_path, headers)
        leading_response = await client.get(f"{ofertas_path}/leading", headers=headers, label="leading_check")
        leading_response.raise_for_status()
        leading_amount = leading_response.json()["amount"]

    issues: list[str] = []

    accepted = [o for o in all_ofertas if o["status"] == "accepted"]
    rejected = [o for o in all_ofertas if o["status"] == "rejected"]
    outbid = [o for o in all_ofertas if o["status"] == "outbid"]

    # Ningún id duplicado -- una oferta persistida dos veces sería la firma de una
    # carrera mal resuelta (dos requests concurrentes creyendo, cada uno, que fueron
    # los primeros en escribir).
    ids = [o["id"] for o in all_ofertas]
    if len(set(ids)) != len(ids):
        issues.append(f"IDs de oferta duplicados detectados ({len(ids) - len(set(ids))} repetidos).")

    # Exactamente un ganador vigente -- el invariante más importante de ADR-004/RNF-09.
    if len(accepted) == 0 and len(all_ofertas) > 0:
        issues.append(
            "Ninguna oferta quedó 'accepted': si se envió al menos una oferta válida, "
            "debería haber exactamente una vigente."
        )
    elif len(accepted) > 1:
        issues.append(
            f"DOS O MÁS ganadores vigentes simultáneos ({len(accepted)} ofertas 'accepted') "
            "-- el lock de fila de ADR-004 no serializó correctamente esta corrida."
        )

    winner_amount = accepted[0]["amount"] if len(accepted) == 1 else None

    # El monto ganador (leído del historial) tiene que coincidir con GET .../leading
    # (lectura independiente) -- si divergen, el estado que ve un comprador real no es
    # el mismo que el que quedó persistido.
    if winner_amount is not None and leading_amount is not None:
        if Decimal(str(winner_amount)) != Decimal(str(leading_amount)):
            issues.append(
                f"El monto de la oferta 'accepted' ({winner_amount}) no coincide con "
                f"GET .../ofertas/leading ({leading_amount}) -- inconsistencia entre "
                "el historial y el endpoint de lectura rápida."
            )
    elif winner_amount is None and leading_amount is not None:
        issues.append(
            f"GET .../ofertas/leading devuelve {leading_amount} pero no hay ninguna "
            "oferta 'accepted' en el historial."
        )

    # Secuencia histórica de "quién fue la vigente en cada momento" -- accepted (el
    # actual) + outbid (los que en su momento lo fueron).
    #
    # NO se puede reconstruir ordenando por `created_at`: esa columna usa
    # `server_default=func.now()` (app/db/mixins.py) y `now()` de Postgres se fija al
    # INICIO de la transacción, no al momento real del INSERT (comportamiento
    # documentado de Postgres, no un bug) -- bajo contención real del lock de fila de
    # ADR-004, una transacción puede "empezar" (y fijar su `now()`) antes que otra pero
    # tener que ESPERAR el lock más tiempo, así que terminar insertando después. Un
    # ordenamiento ingenuo por `created_at` puede mostrar una oferta de monto menor
    # apareciendo "después" de una de monto mayor sin que eso sea una falla real del
    # Auction Engine -- se confirmó a mano contra una corrida real (ver commit/PR).
    #
    # La reconstrucción confiable usa una propiedad más fuerte: cuando una oferta X
    # deja de ser la vigente (pasa a `outbid`), eso ocurre en la MISMA transacción que
    # inserta la oferta Y que la superó -- mismo `now()` para ambas escrituras. Por eso
    # `X.updated_at == Y.created_at` identifica el par (X, Y) sin ambigüedad (salvo
    # colisión exacta de microsegundo entre transacciones no relacionadas, que se
    # reporta aparte, no se asume silenciosamente).
    by_created_at: dict[str, list[dict]] = {}
    for oferta in accepted + outbid:
        by_created_at.setdefault(oferta["created_at"], []).append(oferta)

    successor_of: dict[str, dict] = {}  # id de la oferta superada -> oferta que la superó
    for oferta in outbid:
        candidates = [o for o in by_created_at.get(oferta["updated_at"], []) if o["id"] != oferta["id"]]
        if len(candidates) == 1:
            successor_of[oferta["id"]] = candidates[0]
        elif len(candidates) > 1:
            issues.append(
                f"Timestamp ambiguo reconstruyendo el orden real: {len(candidates)} ofertas "
                f"comparten created_at con el updated_at de {oferta['id']} -- no se pudo "
                "encadenar sin ambigüedad (colisión de microsegundo bajo carga muy alta)."
            )
        else:
            issues.append(
                f"No se encontró qué oferta superó a {oferta['id']} (quedó 'outbid' pero "
                "ninguna oferta posterior coincide en timestamp) -- historial inconsistente."
            )

    # Caminar la cadena real HACIA ATRÁS desde la vigente actual (único elemento de
    # `accepted`) siguiendo, para cada oferta, cuál fue la que superó -- invirtiendo
    # `successor_of` (que mapea "superada -> quién la superó") a `predecessor_of`
    # ("quién superó -> a quién superó"). Se llega hasta la primera oferta jamás
    # aceptada de este lote (la que no superó a nadie porque no había nadie todavía).
    timeline: list[dict] = []
    if len(accepted) == 1:
        predecessor_of = {beater["id"]: beaten_id for beaten_id, beater in successor_of.items()}
        by_id = {o["id"]: o for o in (accepted + outbid)}
        seen: set[str] = set()
        chain_ids: list[str] = []
        current_id: str | None = accepted[0]["id"]
        while current_id is not None and current_id not in seen:
            seen.add(current_id)
            chain_ids.append(current_id)
            current_id = predecessor_of.get(current_id)
        timeline = [by_id[i] for i in reversed(chain_ids)]
        if len(timeline) != len(accepted) + len(outbid):
            issues.append(
                f"La cadena reconstruida tiene {len(timeline)} ofertas pero hay "
                f"{len(accepted) + len(outbid)} accepted+outbid en total -- alguna quedó "
                "fuera de la cadena única esperada (ver mensajes de timestamp ambiguo arriba)."
            )

    previous_amount: Decimal | None = None
    for oferta in timeline:
        amount = Decimal(str(oferta["amount"]))
        if amount <= 0:
            issues.append(f"Oferta {oferta['id']} con monto no positivo ({amount}).")
        if previous_amount is None:
            if amount < base_price:
                issues.append(
                    f"Primera oferta vigente ({amount}) por debajo del precio base ({base_price})."
                )
        else:
            minimum_required = previous_amount + min_increment
            if amount < minimum_required:
                issues.append(
                    f"Oferta {oferta['id']} de {amount} no respeta el incremento mínimo "
                    f"(mínimo esperado {minimum_required}, anterior vigente {previous_amount}) "
                    "-- incremento inválido colado bajo carga."
                )
            if amount <= previous_amount:
                issues.append(
                    f"Orden incorrecto: la oferta {oferta['id']} ({amount}) no es mayor que "
                    f"la vigente anterior ({previous_amount}) pese a estar después en el tiempo."
                )
        previous_amount = amount

    # Ninguna oferta que el cliente haya enviado debería faltar (ni sobrar) en lo
    # persistido -- si el generador de carga contó N respuestas 201, tiene que haber N
    # filas (accepted+rejected; 'outbid' no es un status inicial, es una transición
    # posterior de una fila que ya se contó como 'accepted' en su momento).
    if expected_total is not None:
        persisted_total = len(accepted) + len(rejected) + len(outbid)
        if persisted_total != expected_total:
            issues.append(
                f"El generador de carga contó {expected_total} respuestas 201, pero hay "
                f"{persisted_total} filas persistidas (accepted+rejected+outbid) -- posible "
                "pérdida de ofertas o duplicación."
            )

    # rejection_reason nunca vacío en una oferta rechazada -- un rechazo sin motivo
    # sería un bug de auditoría (RNF-15: toda oferta procesada debe quedar loggeada
    # con contexto suficiente para reconstruir qué pasó).
    for oferta in rejected:
        if not oferta.get("rejection_reason"):
            issues.append(f"Oferta rechazada {oferta['id']} sin motivo de rechazo.")

    return IntegrityReport(
        passed=len(issues) == 0,
        issues=issues,
        total_ofertas=len(all_ofertas),
        accepted_count=len(accepted),
        rejected_count=len(rejected),
        outbid_count=len(outbid),
        winner_amount=str(winner_amount) if winner_amount is not None else None,
        leading_amount=str(leading_amount) if leading_amount is not None else None,
    )
