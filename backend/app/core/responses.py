"""Response JSON por defecto de toda la API (Épica 8, remediación de rendimiento --
ver docs/39-pruebas-de-carga-y-rendimiento.md y la Fase 13 del plan de pruebas de
carga/estrés/concurrencia: bajo carga, el backend queda 100% CPU-bound en el propio
proceso -- Postgres y Redis casi ociosos en la misma corrida -- y la serialización JSON
con la librería estándar (`JSONResponse` de Starlette, la que usa FastAPI por defecto)
es una porción medible de ese costo por request, repetida en cada respuesta.

`orjson` no serializa `Decimal` de forma nativa (a diferencia de `UUID`/`datetime`, que
sí soporta) -- todo monto de dinero de la API (`Oferta.amount`, `Lote.base_price`,
`Lote.min_increment`, etc.) es `Decimal`, así que sin un `default=` explícito cualquier
respuesta con un monto rompería con `TypeError`. El `default` de acá lo serializa a
`str(...)`, exactamente el mismo formato que ya producía Pydantic/FastAPI antes de este
cambio (confirmado contra la API real: `"base_price":"100.00"`, nunca un número JSON) --
cero cambio de contrato para ningún cliente (frontend, k6, loadtest, Playwright), solo
más rápido. `OPT_UTC_Z` reproduce el mismo formato de fecha con sufijo "Z" que ya
devolvía la API (sin esa opción, orjson usa "+00:00").
"""

from decimal import Decimal
from typing import Any

import orjson
from fastapi.responses import JSONResponse


def _default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"No se pudo serializar el tipo {type(value)!r} a JSON.")


class ORJSONResponse(JSONResponse):
    """Reemplazo de `fastapi.responses.ORJSONResponse` con soporte de `Decimal` --
    la versión de FastAPI no lo tiene, y sin eso cualquier endpoint que devuelva un
    monto de dinero rompería."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(content, default=_default, option=orjson.OPT_UTC_Z)
