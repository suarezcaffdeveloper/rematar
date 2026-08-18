"""Tests de `app/whatsapp/phone.py::normalize_whatsapp_number` -- puros, sin red ni
base de datos."""

from app.core.config import Settings
from app.whatsapp.phone import normalize_whatsapp_number


def _settings(**overrides) -> Settings:
    defaults = dict(
        DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
        REDIS_URL="redis://localhost:6379/0",
        SECRET_KEY="test-secret",
    )
    defaults.update(overrides)
    return Settings(**defaults)


def test_ar_number_already_with_mobile_nine_passes_through() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("+5491122334455", settings) == "5491122334455"


def test_ar_number_missing_mobile_nine_gets_it_inserted() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("+541122334455", settings) == "5491122334455"


def test_bare_local_number_gets_default_country_code_and_nine_fix() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("1122334455", settings) == "5491122334455"


def test_number_with_separators_is_stripped_before_normalizing() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("+54 9 11-2233-4455", settings) == "5491122334455"


def test_number_with_different_country_code_is_left_as_is() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("+59899123456", settings) == "59899123456"


def test_too_short_garbage_returns_none() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("123", settings) is None


def test_non_digit_input_returns_none() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("no-es-un-telefono", settings) is None


def test_none_input_returns_none() -> None:
    settings = _settings()
    assert normalize_whatsapp_number(None, settings) is None


def test_empty_string_returns_none() -> None:
    settings = _settings()
    assert normalize_whatsapp_number("", settings) is None
