"""Ver el docstring de `_cors_headers_for_unhandled_error` (app/core/exceptions.py):
una excepción sin manejar nunca pasa por `CORSMiddleware` porque Starlette la enruta
directo a `ServerErrorMiddleware` (el más externo de la pila) -- sin agregar el
`Access-Control-Allow-Origin` a mano ahí, el navegador reporta la request entera como
bloqueada por CORS en vez de mostrar el 500 real. Este test reproduce exactamente eso:
una ruta que revienta con una excepción genérica, pedida con un Origin permitido.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)

    @app.get("/boom")
    async def boom() -> None:
        raise PermissionError("simulado -- ej. escribir contra un volumen sin permisos")

    return app


def test_unhandled_exception_todavia_lleva_encabezados_cors():
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)
    allowed_origin = get_settings().CORS_ORIGINS[0]

    response = client.get("/boom", headers={"Origin": allowed_origin})

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == allowed_origin
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert response.json()["error"]["code"] == "internal_error"


def test_sin_origin_permitido_no_agrega_encabezados_cors():
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/boom", headers={"Origin": "https://otro-sitio-no-permitido.com"})

    assert response.status_code == 500
    assert "access-control-allow-origin" not in response.headers
