from httpx import AsyncClient


async def test_health_check_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # El detalle de "checks.redis" (ok/unavailable) se prueba en
    # tests/test_redis_infrastructure.py — acá solo se confirma el contrato mínimo.
    assert "checks" in body
