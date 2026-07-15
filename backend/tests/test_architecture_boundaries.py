"""Verifica, a nivel de import estático, las restricciones de acoplamiento explícitas
de la Épica 3 (Módulo 3.5): el Auction Engine nunca debe conocer WebSockets, y el
Gateway WebSocket nunca debe conocer lógica de negocio. Ver
docs/22-sincronizacion-tiempo-real.md y ADR-025.

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


def test_gateway_websocket_never_imports_domain_or_realtime() -> None:
    forbidden_prefixes = ("app.modules.remates", "app.modules.ofertas", "app.realtime")
    # `app.modules.auth` es la única excepción documentada (ADR-023): el Gateway
    # reutiliza `AuthService` para resolver identidad, no para nada de negocio.
    offenders = {}

    for path in (APP_DIR / "websocket").glob("*.py"):
        imports = _imported_module_names(path)
        bad = {
            name
            for name in imports
            if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden_prefixes)
        }
        if bad:
            offenders[path.name] = bad

    assert offenders == {}, f"El Gateway WebSocket importa lógica de negocio: {offenders}"


def test_auction_engine_never_imports_websockets_or_realtime() -> None:
    forbidden_prefixes = ("app.websocket", "app.realtime")
    offenders = {}

    ofertas_dir = APP_DIR / "modules" / "ofertas"
    for path in ofertas_dir.glob("*.py"):
        imports = _imported_module_names(path)
        bad = {
            name
            for name in imports
            if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden_prefixes)
        }
        if bad:
            offenders[path.name] = bad

    assert offenders == {}, f"El módulo de ofertas (Auction Engine) importa WebSockets: {offenders}"


def test_remates_and_lotes_never_import_websockets_or_realtime() -> None:
    forbidden_prefixes = ("app.websocket", "app.realtime")
    offenders = {}

    remates_dir = APP_DIR / "modules" / "remates"
    for path in remates_dir.rglob("*.py"):
        imports = _imported_module_names(path)
        bad = {
            name
            for name in imports
            if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden_prefixes)
        }
        if bad:
            offenders[str(path.relative_to(remates_dir))] = bad

    assert offenders == {}, f"El módulo de remates/lotes importa WebSockets: {offenders}"


def test_realtime_only_depends_on_events_and_websocket_public_surface() -> None:
    """El Event Consumer (app/realtime/) puede importar tanto el Event Bus como el
    Gateway -- es, a propósito, el único paquete al que se le permite conocer ambos
    mundos (ver docstring de app/realtime/__init__.py)."""
    realtime_dir = APP_DIR / "realtime"
    forbidden_prefixes = ("app.modules.auth", "app.modules.users")

    offenders = {}
    for path in realtime_dir.glob("*.py"):
        imports = _imported_module_names(path)
        bad = {
            name
            for name in imports
            if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden_prefixes)
        }
        if bad:
            offenders[path.name] = bad

    assert offenders == {}, f"app/realtime/ no debería depender de auth/users: {offenders}"
