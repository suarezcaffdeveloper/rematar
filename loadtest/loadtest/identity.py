"""Alta e inicio de sesión de las identidades que necesita una corrida: N compradores,
un rematador y el admin ya bootstrapeado. Todo vía la API pública ya existente
(`POST /auth/register`, `POST /auth/login`) -- cero acceso directo a la base de datos,
para que la herramienta funcione contra cualquier entorno corriendo, no solo contra una
base local con acceso directo (ver ADR-042).

Las credenciales generadas se cachean en `.cache/credentials-<host>.json` (gitignored)
para que corridas repetidas contra el mismo backend no tengan que re-registrar miles de
usuarios cada vez -- si el usuario ya existe, simplemente se loguea.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from loadtest.client_http import HttpClient
from loadtest.config import RunConfig

# email-validator (usado por Pydantic EmailStr en el backend) rechaza TLDs reservados
# por IANA (.local, .test, .example, .invalid, .localhost) -- se descubrió en la
# práctica durante la Fase 0 del proyecto (ver .env.example). Se reutiliza el mismo
# dominio no reservado que ya usa el admin bootstrapeado.
EMAIL_DOMAIN = "rematar.io"
BUYER_PASSWORD = "loadtest-buyer-pass-1234"
AUCTIONEER_PASSWORD = "loadtest-auctioneer-pass-1234"


@dataclass
class Identity:
    email: str
    password: str
    access_token: str
    user_id: str


@dataclass
class IdentityPool:
    auctioneer: Identity
    buyers: list[Identity]


def _cache_path(cache_dir: Path, host: str) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    host_hash = hashlib.sha256(host.encode("utf-8")).hexdigest()[:12]
    return cache_dir / f"credentials-{host_hash}.json"


def _load_cache(cache_dir: Path, host: str) -> dict[str, dict[str, str]]:
    path = _cache_path(cache_dir, host)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _save_cache(cache_dir: Path, host: str, entries: dict[str, dict[str, str]]) -> None:
    path = _cache_path(cache_dir, host)
    path.write_text(json.dumps(entries, indent=2), encoding="utf-8")


async def _register_or_login(
    client: HttpClient,
    email: str,
    password: str,
    full_name: str,
    role: str,
    *,
    already_registered: bool,
) -> Identity:
    if not already_registered:
        register_response = await client.post(
            "/auth/register",
            json={"email": email, "password": password, "full_name": full_name, "role": role},
            label="register",
        )
        if register_response.status_code not in (201, 409):
            register_response.raise_for_status()

    login_response = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        label="login",
    )
    login_response.raise_for_status()
    token = login_response.json()["access_token"]

    me_response = await client.get(
        "/users/me", headers={"Authorization": f"Bearer {token}"}, label="get_current_user"
    )
    me_response.raise_for_status()
    user_id = me_response.json()["id"]
    return Identity(email=email, password=password, access_token=token, user_id=user_id)


async def ensure_identity_pool(config: RunConfig, num_buyers: int) -> IdentityPool:
    """Registra (o reutiliza, `POST /auth/register` responde 409 si ya existe) los N
    compradores y el rematador de la corrida, y siempre loguea de nuevo -- los access
    tokens expiran (`ACCESS_TOKEN_EXPIRE_MINUTES`, default 30min), así que cachear el
    token no evitaría el login. Lo que sí evita el cache (`.cache/credentials-*.json`)
    es volver a pagar el costo de N registros en corridas repetidas: el registro es la
    parte cara (hashing Argon2 de la contraseña), el login es barato en comparación."""
    cache = _load_cache(config.cache_dir, config.host)
    known_emails: set[str] = set()
    if "auctioneer" in cache:
        known_emails.add(cache["auctioneer"]["email"])
    known_emails.update(entry["email"] for entry in cache.get("buyers", []))

    semaphore = asyncio.Semaphore(config.setup_concurrency)

    async with HttpClient(config.api_base_url) as client:

        async def resolve(email: str, password: str, full_name: str, role: str) -> Identity:
            async with semaphore:
                return await _register_or_login(
                    client,
                    email,
                    password,
                    full_name,
                    role,
                    already_registered=email in known_emails,
                )

        auctioneer_email = f"loadtest-auctioneer@{EMAIL_DOMAIN}"
        auctioneer = await resolve(
            auctioneer_email, AUCTIONEER_PASSWORD, "LoadTest Rematador", "rematador"
        )

        buyer_emails = [f"loadtest-buyer-{i:05d}@{EMAIL_DOMAIN}" for i in range(num_buyers)]
        buyers = await asyncio.gather(
            *(
                resolve(email, BUYER_PASSWORD, f"LoadTest Comprador {i:05d}", "comprador")
                for i, email in enumerate(buyer_emails)
            )
        )

    cache["auctioneer"] = asdict(auctioneer)
    cache["buyers"] = [asdict(buyer) for buyer in buyers]
    _save_cache(config.cache_dir, config.host, cache)

    return IdentityPool(auctioneer=auctioneer, buyers=list(buyers))


async def get_admin_identity(config: RunConfig) -> Identity:
    """Login del admin ya bootstrapeado (`app/scripts/create_superuser.py`) -- nunca se
    registra por la API pública (`PUBLICLY_REGISTERABLE_ROLES` lo prohíbe a propósito,
    ver `backend/app/modules/users/schemas.py`)."""
    async with HttpClient(config.api_base_url) as client:
        login_response = await client.post(
            "/auth/login",
            data={"username": config.admin_email, "password": config.admin_password},
            label="login",
        )
        login_response.raise_for_status()
        token = login_response.json()["access_token"]
        me_response = await client.get(
            "/users/me", headers={"Authorization": f"Bearer {token}"}, label="get_current_user"
        )
        me_response.raise_for_status()
        return Identity(
            email=config.admin_email,
            password=config.admin_password,
            access_token=token,
            user_id=me_response.json()["id"],
        )
