"""Verifica, a nivel de import estático, las restricciones de acoplamiento explícitas
de la Épica 3 (Módulos 3.5 y 3.6): el Auction Engine nunca debe conocer WebSockets ni
el Snapshot Service; el Gateway WebSocket nunca debe conocer lógica de negocio; el
Snapshot Service nunca debe conocer el Gateway ni el Event Consumer. Ver
docs/22-sincronizacion-tiempo-real.md, docs/23-snapshot-service.md, ADR-025 y ADR-026.

No son tests de comportamiento — son una red de seguridad estática y barata contra una
regresión futura (alguien agrega un import "de conveniencia" que rompe el
desacoplamiento sin que ningún test funcional lo note).
"""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"


def _imported_module_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def _find_forbidden_imports(
    paths: list[Path], forbidden_prefixes: tuple[str, ...], *, relative_to: Path
) -> dict[str, set[str]]:
    offenders: dict[str, set[str]] = {}
    for path in paths:
        imports = _imported_module_names(path)
        bad = {
            name
            for name in imports
            if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden_prefixes)
        }
        if bad:
            offenders[str(path.relative_to(relative_to))] = bad
    return offenders


def test_gateway_websocket_never_imports_domain() -> None:
    # `app.snapshot`, `app.presence` y `app.moderation` están deliberadamente afuera de
    # esta lista: el Módulo 3.6 pidió explícitamente que el Gateway use `SnapshotService`
    # al entrar a una sala, el Módulo 6.2 agregó `PresenceService` para el join/leave, y
    # el Módulo 7.6 agregó `ModerationService` para el chequeo de ban (ver docstring de
    # app/websocket/router.py) — son los únicos paquetes "de negocio" que el Gateway
    # tiene permitido conocer, además de `app.modules.auth` (ADR-023).
    forbidden_prefixes = ("app.modules.remates", "app.modules.ofertas")
    websocket_dir = APP_DIR / "websocket"
    offenders = _find_forbidden_imports(
        list(websocket_dir.glob("*.py")), forbidden_prefixes, relative_to=websocket_dir
    )
    assert offenders == {}, f"El Gateway WebSocket importa lógica de negocio: {offenders}"


def test_auction_engine_never_imports_websockets_realtime_or_snapshot() -> None:
    # `app.analytics` (Épica 7, Módulo 7.1) también está prohibido: es un consumidor de
    # lectura del dominio, la dependencia va en un solo sentido (analytics -> ofertas),
    # nunca al revés.
    forbidden_prefixes = ("app.websocket", "app.realtime", "app.snapshot", "app.analytics")
    ofertas_dir = APP_DIR / "modules" / "ofertas"
    offenders = _find_forbidden_imports(
        list(ofertas_dir.glob("*.py")), forbidden_prefixes, relative_to=ofertas_dir
    )
    assert offenders == {}, (
        f"El módulo de ofertas (Auction Engine) importa infraestructura de tiempo real: {offenders}"
    )


def test_remates_and_lotes_never_import_websockets_realtime_or_snapshot() -> None:
    # `app.analytics` (Épica 7, Módulo 7.1): mismo razonamiento que arriba -- lee de
    # remates/lotes, nunca al revés.
    forbidden_prefixes = ("app.websocket", "app.realtime", "app.snapshot", "app.analytics")
    remates_dir = APP_DIR / "modules" / "remates"
    offenders = _find_forbidden_imports(
        list(remates_dir.rglob("*.py")), forbidden_prefixes, relative_to=remates_dir
    )
    assert offenders == {}, (
        f"El módulo de remates/lotes importa infraestructura de tiempo real: {offenders}"
    )


def test_realtime_only_depends_on_events_and_websocket_public_surface() -> None:
    """El Event Consumer (app/realtime/) puede importar tanto el Event Bus como el
    Gateway -- es, a propósito, el único paquete al que se le permite conocer ambos
    mundos (ver docstring de app/realtime/__init__.py). No debería, sin embargo,
    necesitar nada del Snapshot Service (Módulo 3.6): son consumidores hermanos e
    independientes del mismo Gateway, no se conocen entre sí."""
    forbidden_prefixes = ("app.modules.auth", "app.modules.users", "app.snapshot")
    realtime_dir = APP_DIR / "realtime"
    offenders = _find_forbidden_imports(
        list(realtime_dir.glob("*.py")), forbidden_prefixes, relative_to=realtime_dir
    )
    assert offenders == {}, f"app/realtime/ no debería depender de auth/users/snapshot: {offenders}"


def test_snapshot_service_core_never_imports_gateway_or_realtime() -> None:
    """`SnapshotService` (Épica 3, Módulo 3.6) debe ser reutilizable por HTTP,
    WebSocket o cualquier transporte futuro -- se verifica acá que su núcleo
    (`service.py`, `schemas.py`, `dependencies.py`, `router.py`) nunca importe nada de
    `app.websocket` ni `app.realtime`. `messages.py` es la única excepción documentada
    (igual que `app/realtime/messages.py` en el Módulo 3.5): es, a propósito, el
    adaptador que traduce un snapshot al protocolo del Gateway, subclaseando
    `WSMessage` sin modificarlo -- no es parte del servicio reutilizable en sí."""
    forbidden_prefixes = ("app.websocket", "app.realtime")
    snapshot_dir = APP_DIR / "snapshot"
    core_files = [p for p in snapshot_dir.glob("*.py") if p.name != "messages.py"]
    offenders = _find_forbidden_imports(core_files, forbidden_prefixes, relative_to=snapshot_dir)
    assert offenders == {}, (
        f"El núcleo del Snapshot Service depende del Gateway/Event Consumer: {offenders}"
    )


def test_snapshot_messages_only_extends_websocket_protocol() -> None:
    """El único archivo de app/snapshot/ que puede tocar app.websocket es messages.py,
    y únicamente para importar `WSMessage` (nunca `app.realtime`)."""
    messages_path = APP_DIR / "snapshot" / "messages.py"
    imports = _imported_module_names(messages_path)
    realtime_imports = {n for n in imports if n == "app.realtime" or n.startswith("app.realtime.")}
    assert realtime_imports == set(), (
        f"app/snapshot/messages.py no debería depender de app.realtime: {realtime_imports}"
    )


def test_presence_never_imports_domain_or_realtime_or_snapshot() -> None:
    """`app/presence/` (Épica 6, Módulo 6.2) no debe conocer los módulos de dominio de
    remates/ofertas, ni el Event Consumer (`app.realtime`) ni el Snapshot Service
    (`app.snapshot`) -- la dirección de dependencia es la inversa: `app/snapshot/`
    importa `app.presence.schemas` (nunca al revés) y `app/realtime/registry.py`
    importa `app.presence.events` (nunca al revés). Sí puede importar `app.websocket`
    (necesita `RoomManager`/`ConnectionManager`) y `app.modules.auth`/`app.modules.users`
    (autenticación de `router.py`, mismo criterio que `app/snapshot/router.py`)."""
    forbidden_prefixes = (
        "app.modules.remates",
        "app.modules.ofertas",
        "app.realtime",
        "app.snapshot",
    )
    presence_dir = APP_DIR / "presence"
    offenders = _find_forbidden_imports(
        list(presence_dir.glob("*.py")), forbidden_prefixes, relative_to=presence_dir
    )
    assert offenders == {}, (
        f"app/presence/ depende de dominio o de otra capa de tiempo real: {offenders}"
    )


def test_chat_never_imports_websocket_realtime_snapshot_presence_or_ofertas() -> None:
    """`app/modules/chat/` (Épica 6, Módulo 6.4) es un módulo de dominio propio, mismo
    perfil que `ofertas` (entidad persistida con reglas propias) -- nunca debe conocer
    el Gateway WebSocket, el Snapshot Service ni el Presence Service (transporte, no
    dominio), ni el módulo de ofertas (bounded context ajeno). Tampoco debe importar
    `app.realtime`: la entrega de eventos de chat a los clientes reutiliza
    `EventDispatcher`/`EventConsumer` sin que `app/modules/chat/` necesite conocerlos
    (agregar la clase de evento a `app/realtime/registry.py` es la única integración, y
    esa dirección de import va al revés -- `registry.py` importa `app.modules.chat.events`,
    nunca al revés); la segunda instancia de `EventConsumer` que genera mensajes de
    sistema (`ChatSystemEventDispatcher`, `app/modules/chat/realtime.py`) se conecta
    con `EventConsumer` únicamente en `app/main.py`, no acá."""
    forbidden_prefixes = (
        "app.websocket",
        "app.realtime",
        "app.snapshot",
        "app.presence",
        "app.modules.ofertas",
    )
    chat_dir = APP_DIR / "modules" / "chat"
    offenders = _find_forbidden_imports(
        list(chat_dir.glob("*.py")), forbidden_prefixes, relative_to=chat_dir
    )
    assert offenders == {}, (
        f"app/modules/chat/ depende de transporte/tiempo real o de un bounded context "
        f"ajeno: {offenders}"
    )


def test_analytics_never_imports_websocket_realtime_snapshot_or_chat() -> None:
    """`app/analytics/` (Épica 7, Módulo 7.1) es un compositor de lectura, mismo perfil
    que `app/snapshot/`/`app/presence/` -- nunca debe conocer el Gateway WebSocket, el
    Event Consumer ni el Snapshot Service (ninguna métrica pasa por ahí, todo sale de
    consultas propias a Postgres + `PresenceService`), ni el módulo de Chat (bounded
    context ajeno, ninguna métrica pedida depende de él). A diferencia de
    `app/presence/`/`app/snapshot/` (que evitan el dominio por completo), Analítica sí
    importa `app.modules.remates`/`app.modules.ofertas`/`app.modules.users` a propósito
    -- cada métrica es una consulta directa sobre esos modelos (ver docstring de
    `repository.py`)."""
    forbidden_prefixes = (
        "app.websocket",
        "app.realtime",
        "app.snapshot",
        "app.modules.chat",
    )
    analytics_dir = APP_DIR / "analytics"
    offenders = _find_forbidden_imports(
        list(analytics_dir.glob("*.py")), forbidden_prefixes, relative_to=analytics_dir
    )
    assert offenders == {}, (
        f"app/analytics/ depende de transporte/tiempo real o del módulo de chat: {offenders}"
    )


def test_audit_never_imports_websocket_realtime_snapshot_or_chat() -> None:
    """`app/audit/` (Épica 7, Módulo 7.2) nunca debe conocer el Gateway WebSocket, el
    Event Consumer ni el Snapshot Service (el registro de auditoría se escribe por
    llamada directa desde cada servicio de dominio, nunca escuchando el pipeline de
    tiempo real -- ver ADR-039 sección A), ni el módulo de Chat ni el de Ofertas
    (bounded contexts ajenos: `AuditService.list_for_remate` solo necesita
    `RemateService` para resolver ownership/visibilidad, mismo criterio que
    `AnalyticsService`)."""
    forbidden_prefixes = (
        "app.websocket",
        "app.realtime",
        "app.snapshot",
        "app.modules.chat",
        "app.modules.ofertas",
    )
    audit_dir = APP_DIR / "audit"
    offenders = _find_forbidden_imports(
        list(audit_dir.glob("*.py")), forbidden_prefixes, relative_to=audit_dir
    )
    assert offenders == {}, (
        f"app/audit/ depende de transporte/tiempo real o de un bounded context ajeno: {offenders}"
    )


def test_domain_modules_only_use_audit_write_surface() -> None:
    """Los módulos de dominio (remates/lotes, ofertas, chat, auth) dependen de
    `app.audit.repository`/`app.audit.models`/`app.audit.actions` -- la superficie de
    **escritura** de Auditoría (Épica 7, Módulo 7.2), sin dependencias de `app.modules.*`
    -- para dejar constancia de sus propias acciones (ver ADR-039 sección C). Nunca
    deben importar `app.audit.service` ni `app.audit.router` (la superficie de
    **lectura**, exclusiva del panel admin/rematador): esa dirección cerraría un ciclo,
    porque `app.audit.service` ya depende de `RemateService` -- mismo criterio
    "LoteRepository, no LoteService" que ya evita el ciclo simétrico documentado en
    ADR-019."""
    forbidden_prefixes = ("app.audit.service", "app.audit.router")
    domain_dirs = [
        APP_DIR / "modules" / "remates",
        APP_DIR / "modules" / "ofertas",
        APP_DIR / "modules" / "chat",
        APP_DIR / "modules" / "auth",
    ]
    offenders: dict[str, set[str]] = {}
    for domain_dir in domain_dirs:
        offenders.update(
            _find_forbidden_imports(
                list(domain_dir.rglob("*.py")), forbidden_prefixes, relative_to=APP_DIR
            )
        )
    assert offenders == {}, (
        f"Un módulo de dominio depende de la superficie de lectura de auditoría "
        f"(app.audit.service/router) en vez de solo la de escritura: {offenders}"
    )


def test_history_never_imports_websocket_realtime_snapshot_audit_or_analytics_service() -> None:
    """`app/history/` (Épica 7, Módulo 7.3) nunca debe conocer el Gateway WebSocket, el
    Event Consumer ni el Snapshot Service (es un compositor de solo lectura sobre datos
    ya persistidos, sin transporte propio). Tampoco debe importar `app.audit` en
    absoluto -- la línea de tiempo del detalle de un remate se resuelve reutilizando el
    panel de auditoría ya construido del lado del **frontend** (`AuditLogView`,
    `scope=remate`), nunca desde el backend, ver ADR-040. Ni `app.analytics.service`
    (solo `app.analytics.repository`/`schemas`, que son puros -- `AnalyticsService` está
    acoplado a `PresenceService`/caché Redis, pensados para "ahora mismo", no para un
    remate ya terminado). A diferencia de `app/analytics/`/`app/audit/`, **sí** puede
    importar `app.modules.chat` (necesita `ChatMessage` para la actividad de chat del
    detalle de un remate, ver `repository.py`)."""
    forbidden_prefixes = (
        "app.websocket",
        "app.realtime",
        "app.snapshot",
        "app.audit",
        "app.analytics.service",
    )
    history_dir = APP_DIR / "history"
    offenders = _find_forbidden_imports(
        list(history_dir.glob("*.py")), forbidden_prefixes, relative_to=history_dir
    )
    assert offenders == {}, (
        f"app/history/ depende de transporte/tiempo real, de app.audit, o del "
        f"AnalyticsService acoplado a Presencia/caché: {offenders}"
    )


def test_monitoring_never_imports_realtime_snapshot_audit_history_or_analytics() -> None:
    """`app/monitoring/` (Épica 8, Módulo 8.1) nunca debe conocer el Event Consumer ni
    el Snapshot Service (health checks/métricas no pasan por ahí), ni ningún otro
    compositor de lectura (`app.audit`, `app.history`, `app.analytics` -- bounded
    contexts hermanos, sin relación con observabilidad de la plataforma). A diferencia
    de `app/analytics/`/`app/audit/`/`app/history/`, **sí** puede importar
    `app.websocket` (necesita `ConnectionManager` para contar conexiones activas,
    mismo criterio ya aceptado en `app/presence/dependencies.py`) y
    `app.modules.chat`/`app.modules.ofertas` (necesita `ChatMessage`/`Oferta` para los
    conteos "por minuto", ver `repository.py`)."""
    forbidden_prefixes = (
        "app.realtime",
        "app.snapshot",
        "app.audit",
        "app.history",
        "app.analytics",
    )
    monitoring_dir = APP_DIR / "monitoring"
    offenders = _find_forbidden_imports(
        list(monitoring_dir.glob("*.py")), forbidden_prefixes, relative_to=monitoring_dir
    )
    assert offenders == {}, (
        f"app/monitoring/ depende de tiempo real o de otro compositor de lectura ajeno "
        f"a observabilidad: {offenders}"
    )


def test_timer_never_imports_websocket_realtime_snapshot_audit_history_analytics_or_chat() -> None:
    """`app/timer/` (Épica 8, "cuenta regresiva y cierre automático") nunca debe
    conocer el Gateway WebSocket, el Event Consumer, el Snapshot Service, ni ningún
    compositor de lectura hermano (`app.history`/`app.analytics`) ni el módulo de Chat
    -- ninguno de esos tiene relación con el timer de un lote. Sí puede importar
    `app.modules.remates`/`app.modules.remates.lotes` (dueño de las columnas del
    timer) y, únicamente en `scheduler.py`, `app.modules.ofertas` (necesita
    `OfertaRepository.get_leading_offer` para la adjudicación automática, ver
    docstring de `TimerExpiryScheduler`) -- `service.py`/`router.py`/`dependencies.py`
    no deberían necesitarlo. Como cualquier módulo de dominio (ADR-039, sección C),
    **sí** puede depender de `app.audit.repository`/`app.audit.actions` (la superficie
    de *escritura* de Auditoría, para dejar constancia de pausar/reanudar/reiniciar/
    ajustar el timer) -- nunca de `app.audit.service`/`app.audit.router` (la
    superficie de *lectura*, exclusiva del panel admin/rematador)."""
    forbidden_prefixes = (
        "app.websocket",
        "app.realtime",
        "app.snapshot",
        "app.audit.service",
        "app.audit.router",
        "app.history",
        "app.analytics",
        "app.modules.chat",
    )
    timer_dir = APP_DIR / "timer"
    non_scheduler_files = [p for p in timer_dir.glob("*.py") if p.name != "scheduler.py"]
    offenders = _find_forbidden_imports(
        non_scheduler_files, forbidden_prefixes, relative_to=timer_dir
    )
    assert offenders == {}, (
        f"app/timer/ depende de tiempo real o de un compositor de lectura ajeno: {offenders}"
    )

    scheduler_offenders = _find_forbidden_imports(
        [timer_dir / "scheduler.py"], forbidden_prefixes, relative_to=timer_dir
    )
    assert scheduler_offenders == {}, (
        f"app/timer/scheduler.py depende de tiempo real o de un compositor de lectura "
        f"ajeno (más allá de app.modules.ofertas, permitido para la adjudicación "
        f"automática): {scheduler_offenders}"
    )


def test_postauction_never_imports_websocket_realtime_snapshot_analytics_or_chat() -> None:
    """`app/postauction/` (Épica 7, Módulo 7.5) nunca debe conocer el Gateway WebSocket,
    el Event Consumer ni el Snapshot Service (se entera de la adjudicación reaccionando a
    `lote.winner_determined` con su propia instancia de `EventConsumer`, cableada
    únicamente en `app/main.py` -- no acá, mismo criterio que
    `ChatSystemEventDispatcher`/`app/modules/chat/`). Tampoco debe importar
    `app.analytics`/`app.modules.chat` (bounded contexts ajenos, sin relación con el
    proceso post-adjudicación). Sí puede importar `app.modules.remates`/
    `app.modules.remates.lotes`/`app.modules.users` (lectura de remate/lote/comprador,
    mismo criterio "repositorio del vecino" que `app/history/`), `app.audit.repository`/
    `app.audit.actions` (superficie de escritura de auditoría, como cualquier módulo de
    dominio) y `app.notifications.repository` (para notificar sin importar su router)."""
    forbidden_prefixes = (
        "app.websocket",
        "app.realtime",
        "app.snapshot",
        "app.analytics",
        "app.modules.chat",
        "app.audit.service",
        "app.audit.router",
        "app.notifications.router",
    )
    postauction_dir = APP_DIR / "postauction"
    offenders = _find_forbidden_imports(
        list(postauction_dir.glob("*.py")), forbidden_prefixes, relative_to=postauction_dir
    )
    assert offenders == {}, (
        f"app/postauction/ depende de transporte/tiempo real, de un bounded context "
        f"ajeno, o de una superficie de lectura que no le corresponde: {offenders}"
    )


def test_notifications_never_imports_postauction_or_domain() -> None:
    """`app/notifications/` (Épica 7, Módulo 7.5) es genérico -- no debe conocer
    `app.postauction` ni ningún módulo de dominio propio: la dirección de dependencia va
    en un solo sentido (postauction -> notifications), igual que `app.audit`/
    `app.history` respecto de los módulos que los usan. `app.modules.auth`/
    `app.modules.users` sí están permitidos en `router.py` -- autenticación del usuario
    actual, mismo criterio que cualquier otro router del proyecto (`audit`/`history`/
    `monitoring`)."""
    forbidden_prefixes = (
        "app.postauction",
        "app.modules.remates",
        "app.modules.ofertas",
        "app.modules.chat",
    )
    notifications_dir = APP_DIR / "notifications"
    offenders = _find_forbidden_imports(
        list(notifications_dir.glob("*.py")), forbidden_prefixes, relative_to=notifications_dir
    )
    assert offenders == {}, (
        f"app/notifications/ depende de app.postauction o de un módulo de dominio, "
        f"rompiendo su carácter genérico: {offenders}"
    )


def test_moderation_never_imports_ofertas_or_chat_write_surface() -> None:
    """`app/moderation/` (Épica 7, Módulo 7.6) nunca debe importar `app.modules.ofertas`
    en absoluto -- se entera de intentos de oferta inválidos reaccionando a
    `oferta.rejected` con su propia instancia de `EventConsumer` (cableada en
    `app/main.py`, leyendo el JSON crudo del evento sin importar la clase
    `OfertaRejected`), nunca importando el Auction Engine. Tampoco debe importar la
    superficie de **escritura** de Chat (`app.modules.chat.service`/`router`/
    `realtime`) -- solo `app.modules.chat.repository`/`models`/`dependencies` (lectura
    puntual de un mensaje para destacarlo), mismo criterio "repositorio del vecino" que
    el resto del proyecto. Ni `app.analytics`/`app.history` (bounded contexts ajenos) ni
    `app.audit.service`/`app.audit.router` (solo la superficie de escritura de
    Auditoría, como cualquier módulo de dominio)."""
    forbidden_prefixes = (
        "app.modules.ofertas",
        "app.modules.chat.service",
        "app.modules.chat.router",
        "app.modules.chat.realtime",
        "app.analytics",
        "app.history",
        "app.audit.service",
        "app.audit.router",
    )
    moderation_dir = APP_DIR / "moderation"
    offenders = _find_forbidden_imports(
        list(moderation_dir.glob("*.py")), forbidden_prefixes, relative_to=moderation_dir
    )
    assert offenders == {}, (
        f"app/moderation/ depende del Auction Engine, de la superficie de escritura de "
        f"Chat, o de un bounded context ajeno: {offenders}"
    )


def test_domain_never_imports_moderation_service_or_router() -> None:
    """Dirección de dependencia de un solo sentido: `app/moderation/` puede leer de
    Chat/Remates/Ofertas (ver test de arriba), pero ningún módulo de dominio debe
    importar `app.moderation.service`/`app.moderation.router` -- `app/modules/chat/
    router.py` solo puede depender de `app.moderation.redis_state`/
    `app.moderation.dependencies` (la superficie liviana de solo lectura, ver su propio
    docstring), nunca del servicio completo (que compone `ConnectionManager`/
    `RoomManager`/`RemateService`/etc., mucho más de lo que un chequeo de mute/lock
    necesita)."""
    forbidden_prefixes = ("app.moderation.service", "app.moderation.router")
    domain_dirs = [
        APP_DIR / "modules" / "chat",
        APP_DIR / "modules" / "ofertas",
        APP_DIR / "modules" / "remates",
    ]
    offenders: dict[str, set[str]] = {}
    for domain_dir in domain_dirs:
        offenders.update(
            _find_forbidden_imports(
                list(domain_dir.rglob("*.py")), forbidden_prefixes, relative_to=APP_DIR
            )
        )
    assert offenders == {}, (
        f"Un módulo de dominio depende del servicio/router completo de Moderación en "
        f"vez de su superficie liviana de lectura: {offenders}"
    )


def test_domain_and_postauction_never_import_postauction_from_domain() -> None:
    """`app/modules/remates/` (incluido `lotes/`) nunca debe importar `app.postauction`
    -- es la garantía de decoupling central del Módulo 7.5 (ADR-044): el Auction Engine
    no sabe que este módulo existe, se entera exclusivamente reaccionando a eventos ya
    publicados vía su propio `EventConsumer` (ver `app/postauction/realtime.py`)."""
    forbidden_prefixes = ("app.postauction",)
    remates_dir = APP_DIR / "modules" / "remates"
    offenders = _find_forbidden_imports(
        list(remates_dir.rglob("*.py")), forbidden_prefixes, relative_to=remates_dir
    )
    assert offenders == {}, f"app/modules/remates/ depende de app.postauction: {offenders}"
