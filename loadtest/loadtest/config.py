"""Configuración de una corrida de carga.

Mismo criterio que `backend/app/core/config.py`: un único lugar navegable, nada de
`os.environ` disperso. A diferencia del backend, acá no hace falta `pydantic-settings`
(no hay un proceso persistente ni un `.env` propio) -- un `dataclass` simple más
`argparse` alcanza para un script de línea de comandos.

Ningún valor por defecto apunta a un entorno productivo: todo apunta a `localhost`,
como cualquier corrida contra el `docker compose up` local descrito en el README raíz.
"""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, field
from pathlib import Path

LOADTEST_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CACHE_DIR = LOADTEST_ROOT / ".cache"
DEFAULT_RESULTS_DIR = LOADTEST_ROOT / "results"


@dataclass
class RunConfig:
    """Todo lo que un escenario necesita para correr contra un backend puntual."""

    host: str = "http://localhost:8000"
    api_prefix: str = "/api/v1"
    admin_email: str = "admin@rematar.io"
    admin_password: str = "administrador123"
    cache_dir: Path = field(default_factory=lambda: DEFAULT_CACHE_DIR)
    results_dir: Path = field(default_factory=lambda: DEFAULT_RESULTS_DIR)
    setup_concurrency: int = 50
    monitoring_poll_interval_seconds: float = 2.0

    @property
    def api_base_url(self) -> str:
        return f"{self.host.rstrip('/')}{self.api_prefix}"

    @property
    def ws_url(self) -> str:
        # El Gateway WebSocket vive en /api/v1/ws (docs/20-gateway-websocket.md) -- el
        # mismo host, protocolo ws/wss según corresponda al esquema http/https.
        scheme = "wss" if self.host.startswith("https") else "ws"
        host_without_scheme = self.host.split("://", 1)[-1].rstrip("/")
        return f"{scheme}://{host_without_scheme}{self.api_prefix}/ws"


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    """Flags compartidos por todos los escenarios (`cli.py` los agrega antes de los
    flags específicos de cada uno)."""
    parser.add_argument(
        "--host",
        default=os.environ.get("RLT_HOST", "http://localhost:8000"),
        help="Base URL del backend (default: %(default)s, o env RLT_HOST)",
    )
    parser.add_argument(
        "--admin-email",
        default=os.environ.get("RLT_ADMIN_EMAIL", "admin@rematar.io"),
        help="Email del admin bootstrapeado (app/scripts/create_superuser.py)",
    )
    parser.add_argument(
        "--admin-password",
        default=os.environ.get("RLT_ADMIN_PASSWORD", "administrador123"),
        help="Password del admin bootstrapeado",
    )
    parser.add_argument(
        "--setup-concurrency",
        type=int,
        default=50,
        help="Cuántos compradores registrar/loguear en paralelo durante el seed (default: 50)",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_RESULTS_DIR),
        help="Directorio donde se escriben summary.json y report.html (default: %(default)s)",
    )


def build_run_config(args: argparse.Namespace) -> RunConfig:
    return RunConfig(
        host=args.host,
        admin_email=args.admin_email,
        admin_password=args.admin_password,
        setup_concurrency=args.setup_concurrency,
        results_dir=Path(args.output_dir),
    )
