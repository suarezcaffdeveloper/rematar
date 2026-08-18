"""Tests de `app/whatsapp/redirect_token.py` -- puros, sin red ni base de datos."""

import uuid
from datetime import timedelta

import pytest

from app.core.config import Settings
from app.core.security import encode_token
from app.modules.auth.security import create_access_token
from app.modules.users.models import UserRole
from app.whatsapp.redirect_token import (
    WhatsAppRedirectTokenInvalidError,
    build_redirect_token,
    resolve_redirect_token,
)


def _settings(**overrides) -> Settings:
    defaults = dict(
        DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
        REDIS_URL="redis://localhost:6379/0",
        SECRET_KEY="test-secret",
    )
    defaults.update(overrides)
    return Settings(**defaults)


def test_valid_token_round_trips_its_payload() -> None:
    settings = _settings()
    case_id = uuid.uuid4()

    token = build_redirect_token(
        case_id=case_id,
        rematador_phone="5491133445566",
        lot_number="3",
        settings=settings,
    )
    payload = resolve_redirect_token(token, settings)

    assert payload["case_id"] == str(case_id)
    assert payload["phone"] == "5491133445566"
    assert payload["lot_number"] == "3"


def test_tampered_token_is_rejected() -> None:
    settings = _settings()
    token = build_redirect_token(
        case_id=uuid.uuid4(),
        rematador_phone="5491133445566",
        lot_number="3",
        settings=settings,
    )
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")

    with pytest.raises(WhatsAppRedirectTokenInvalidError):
        resolve_redirect_token(tampered, settings)


def test_expired_token_is_rejected() -> None:
    settings = _settings()
    token = encode_token(
        {
            "type": "whatsapp_redirect",
            "case_id": str(uuid.uuid4()),
            "phone": "5491133445566",
            "lot_number": "3",
        },
        secret_key=settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
        expires_delta=timedelta(seconds=-1),
    )

    with pytest.raises(WhatsAppRedirectTokenInvalidError):
        resolve_redirect_token(token, settings)


def test_auth_access_token_is_rejected_by_type_claim() -> None:
    settings = _settings()
    access_token = create_access_token(
        user_id=uuid.uuid4(), role=UserRole.COMPRADOR, settings=settings
    )

    with pytest.raises(WhatsAppRedirectTokenInvalidError):
        resolve_redirect_token(access_token, settings)


def test_garbage_token_is_rejected() -> None:
    settings = _settings()

    with pytest.raises(WhatsAppRedirectTokenInvalidError):
        resolve_redirect_token("esto-no-es-un-jwt", settings)
