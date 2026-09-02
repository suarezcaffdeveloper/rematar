"""Cifrado simétrico reversible para secretos de bajo valor que el dueño necesita poder
volver a leer (a diferencia de una contraseña, que nunca se recupera -- se resetea).

Caso de uso actual: `Remate.private_access_code_encrypted` (ver
`app/modules/remates/service.py`). El código de acceso privado de un remate no es un
secreto de alto valor (ver comentario en `models.py`), pero a diferencia del
operator_code sí necesita poder mostrarse de nuevo sin invalidarlo -- por eso cifrado
reversible en vez de hash.

La clave de Fernet se deriva de `Settings.SECRET_KEY` (ya usado para firmar JWT) en vez
de agregar una env var de cifrado aparte: mismo nivel de secreto de aplicación, un solo
valor que rotar.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

__all__ = ["encrypt_secret", "decrypt_secret"]


def _fernet(secret_key: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(value: str, secret_key: str) -> str:
    return _fernet(secret_key).encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str, secret_key: str) -> str:
    try:
        return _fernet(secret_key).decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Token cifrado inválido o clave incorrecta.") from exc
