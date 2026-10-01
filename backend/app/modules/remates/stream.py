"""Transmisión en vivo de un remate: parseo seguro del link que pega la empresa.

Solo se acepta YouTube y solo se persiste el ID del video (11 caracteres), nunca la URL
cruda: el frontend arma el `src` del iframe a partir de ese ID, así que no hay forma de
inyectar `javascript:`, hosts falsos ni redirecciones. Ver plan de transmisión en vivo.
"""

import re
from urllib.parse import parse_qs, urlsplit

STREAM_PROVIDER_YOUTUBE = "youtube"

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_MAX_INPUT_LENGTH = 2048

_YOUTUBE_HOSTS = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
    }
)
_YOUTUBE_SHORT_HOSTS = frozenset({"youtu.be", "www.youtu.be"})
# Rutas tipo `/<prefijo>/<id>` que contienen el ID del video.
_ID_PATH_PREFIXES = frozenset({"live", "embed", "v"})

_INVALID_MESSAGE = (
    "Pegá el link de tu transmisión en vivo de YouTube (por ejemplo "
    "https://www.youtube.com/watch?v=... o https://youtu.be/...)."
)
_CHANNEL_MESSAGE = (
    "Ese link es de un canal, no de una transmisión puntual. Abrí la transmisión en "
    "YouTube y copiá el link del video en vivo."
)


class InvalidStreamUrlError(ValueError):
    pass


def extract_youtube_video_id(raw: str) -> str:
    """Devuelve el ID del video o lanza `InvalidStreamUrlError` (mensaje apto para el
    usuario final)."""
    value = raw.strip()
    if not value or len(value) > _MAX_INPUT_LENGTH:
        raise InvalidStreamUrlError(_INVALID_MESSAGE)

    try:
        parts = urlsplit(value)
        host = (parts.hostname or "").lower()
    except ValueError as exc:
        raise InvalidStreamUrlError(_INVALID_MESSAGE) from exc

    if parts.scheme != "https" or parts.username or parts.password:
        raise InvalidStreamUrlError(_INVALID_MESSAGE)

    segments = [s for s in parts.path.split("/") if s]
    candidate: str | None = None

    if host in _YOUTUBE_SHORT_HOSTS:
        candidate = segments[0] if segments else None
    elif host in _YOUTUBE_HOSTS:
        if segments and segments[0] == "watch":
            candidate = (parse_qs(parts.query).get("v") or [None])[0]
        elif len(segments) >= 2 and segments[0] in _ID_PATH_PREFIXES:
            candidate = segments[1]
        elif segments and (segments[0].startswith("@") or segments[0] in {"channel", "c", "user"}):
            raise InvalidStreamUrlError(_CHANNEL_MESSAGE)
    else:
        raise InvalidStreamUrlError(_INVALID_MESSAGE)

    if candidate is None or not _VIDEO_ID_RE.fullmatch(candidate):
        raise InvalidStreamUrlError(_INVALID_MESSAGE)
    return candidate
