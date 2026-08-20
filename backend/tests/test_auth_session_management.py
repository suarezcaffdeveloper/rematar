"""Tests de Fase 7 (WebSocket Security Audit -- HTTP Authentication & Session Security):
ciclo de vida de sesiones múltiples y comportamiento real (no una política nueva) de
logout sobre el access token HTTP.

Documenta, con tests, el comportamiento ya descripto en el docstring de
`AuthService.get_current_session_from_access_token`: `get_current_user_from_access_token`
(el que usa CADA request HTTP vía `get_current_user`) sólo rechequea `is_active`, no la
revocación de la sesión puntual -- por diseño, para no sumarle una query extra al hot
path de toda la API. El resultado es que un access token todavía no vencido sigue
sirviendo para HTTP incluso después de un logout de esa sesión, hasta su `exp` natural
(`ACCESS_TOKEN_EXPIRE_MINUTES`, 30 min por default) -- sólo las conexiones WebSocket
(que sí resuelven `sid` en el handshake, ver `app/websocket/auth.py`) se cierran de
inmediato. Este test fija ese comportamiento como conocido y no lo cambia (Fase 7 no
pide una política nueva de revocación de access tokens, sólo auditar y documentar la
existente)."""

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.db.session import get_db
from app.main import create_app

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/users/me"


async def _client(db_engine: AsyncEngine):
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.state.db_session_factory = session_factory
    return app


async def _register(client: AsyncClient, *, email: str) -> None:
    response = await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Session Test",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    assert response.status_code == 201, response.text


async def _login(client: AsyncClient, *, email: str) -> dict:
    response = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert response.status_code == 200, response.text
    return response.json()


async def test_logout_of_one_session_does_not_revoke_a_different_session(
    db_engine: AsyncEngine,
) -> None:
    """Sesión A y sesión B del mismo usuario (dos logins independientes, ej. dos
    dispositivos). `logout` de A revoca únicamente el refresh token de A -- B debe seguir
    pudiendo refrescar con normalidad."""
    app = await _client(db_engine)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            email = "multisession@example.com"
            await _register(client, email=email)
            session_a = await _login(client, email=email)
            session_b = await _login(client, email=email)

            logout_response = await client.post(
                LOGOUT_URL, json={"refresh_token": session_a["refresh_token"]}
            )
            assert logout_response.status_code == 204

            # A ya no puede refrescar.
            refresh_a = await client.post(
                REFRESH_URL, json={"refresh_token": session_a["refresh_token"]}
            )
            assert refresh_a.status_code == 401

            # B sigue intacta.
            refresh_b = await client.post(
                REFRESH_URL, json={"refresh_token": session_b["refresh_token"]}
            )
            assert refresh_b.status_code == 200
    app.dependency_overrides.clear()


async def test_access_token_of_a_logged_out_session_still_authenticates_http_until_expiry(
    db_engine: AsyncEngine,
) -> None:
    """Comportamiento real documentado -- ver docstring del módulo. No es lo que pasa con
    WebSocket (Fase 3: se cierra de inmediato), es específico del transporte HTTP."""
    app = await _client(db_engine)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            email = "httpafterlogout@example.com"
            await _register(client, email=email)
            tokens = await _login(client, email=email)

            logout_response = await client.post(
                LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]}
            )
            assert logout_response.status_code == 204

            me_response = await client.get(
                ME_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"}
            )
            assert me_response.status_code == 200

            # Pero la sesión ya no puede renovarse -- el logout sí es efectivo sobre el
            # refresh token, que es lo único que permitiría obtener un access token
            # nuevo más allá de los ACCESS_TOKEN_EXPIRE_MINUTES actuales.
            refresh_response = await client.post(
                REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
            )
            assert refresh_response.status_code == 401
    app.dependency_overrides.clear()
