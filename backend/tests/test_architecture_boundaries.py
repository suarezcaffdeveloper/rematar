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
    # `app.snapshot` está deliberadamente afuera de esta lista: el Módulo 3.6 pidió
    # explícitamente que el Gateway use `SnapshotService` al entrar a una sala (ver
    # docstring de app/websocket/router.py) — es el único paquete "de negocio" que el
    # Gateway tiene permitido conocer, además de `app.modules.auth` (ADR-023).
    forbidden_prefixes = ("app.modules.remates", "app.modules.ofertas")
    websocket_dir = APP_DIR / "websocket"
    offenders = _find_forbidden_imports(
        list(websocket_dir.glob("*.py")), forbidden_prefixes, relative_to=websocket_dir
    )
    assert offenders == {}, f"El Gateway WebSocket importa lógica de negocio: {offenders}"


def test_auction_engine_never_imports_websockets_realtime_or_snapshot() -> None:
    forbidden_prefixes = ("app.websocket", "app.realtime", "app.snapshot")
    ofertas_dir = APP_DIR / "modules" / "ofertas"
    offenders = _find_forbidden_imports(
        list(ofertas_dir.glob("*.py")), forbidden_prefixes, relative_to=ofertas_dir
    )
    assert offenders == {}, (
        f"El módulo de ofertas (Auction Engine) importa infraestructura de tiempo real: {offenders}"
    )


def test_remates_and_lotes_never_import_websockets_realtime_or_snapshot() -> None:
    forbidden_prefixes = ("app.websocket", "app.realtime", "app.snapshot")
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
