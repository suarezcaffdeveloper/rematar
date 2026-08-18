"""Normalización de números de teléfono al formato que espera la API de WhatsApp
Business Cloud (dígitos únicamente, con código de país, sin `+`).

`User.phone` (`app/modules/users/schemas.py::PHONE_PATTERN`) solo garantiza 8-15
dígitos con un `+` opcional al inicio -- no exige código de país. Esta función completa
lo que falta con un supuesto razonable pero no infalible: si el número no trae código
de país, se asume el configurado en `WHATSAPP_DEFAULT_COUNTRY_CODE`. Para Argentina
(código "54") además se aplica la corrección del dígito móvil "9" que WhatsApp exige
(`+54 9 11 2233-4455` -> `5491122334455`) y que un número guardado en formato de
discado normal (`+54 11 2233-4455`) no trae.

Es un best-effort explícito, no una garantía: un número que ya incluye el código de
un país distinto al configurado, sin ningún indicio en los dígitos de cuál es, puede
normalizarse mal. No hay forma de resolver esa ambigüedad solo con los dígitos.
"""

import re

from app.core.config import Settings

_STRIP_CHARS = re.compile(r"[\s\-()]")
_MIN_DIGITS = 10
_MAX_DIGITS = 15
# Longitud de un número argentino "local" (código de área + abonado, sin código de
# país ni el "9" móvil), ej. "1122334455" -- por debajo de este umbral se asume que el
# número no trae código de país y hay que anteponer el default.
_BARE_LOCAL_MAX_DIGITS = 10
_AR_COUNTRY_CODE = "54"
_AR_LOCAL_NUMBER_DIGITS = 10


def normalize_whatsapp_number(raw: str | None, settings: Settings) -> str | None:
    if not raw:
        return None

    stripped = _STRIP_CHARS.sub("", raw).lstrip("+")
    if not stripped or not stripped.isdigit():
        return None

    country_code = settings.WHATSAPP_DEFAULT_COUNTRY_CODE
    if stripped.startswith(country_code):
        digits = stripped
    elif len(stripped) <= _BARE_LOCAL_MAX_DIGITS:
        digits = country_code + stripped
    else:
        # Ya parece traer algún código de país (no necesariamente el default) --
        # se deja como está en vez de arriesgar un prefijo incorrecto.
        digits = stripped

    if country_code == _AR_COUNTRY_CODE and digits.startswith(_AR_COUNTRY_CODE):
        rest = digits[len(_AR_COUNTRY_CODE) :]
        if len(rest) == _AR_LOCAL_NUMBER_DIGITS and not rest.startswith("9"):
            digits = _AR_COUNTRY_CODE + "9" + rest

    if not (_MIN_DIGITS <= len(digits) <= _MAX_DIGITS):
        return None
    return digits
