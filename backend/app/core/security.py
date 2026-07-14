"""Primitivas genéricas de seguridad: hashing de contraseñas y codificación JWT.

Estas funciones no saben nada de "usuarios" ni de "roles" — solo hashean strings y
codifican/decodifican diccionarios como JWT. La forma concreta de un token de acceso o
de refresh (qué claims lleva, cuánto dura cada uno) es una decisión del dominio de
autenticación y vive en `app/modules/auth/security.py`, no acá. Mantener esta separación
es lo que permite reutilizar el hashing de contraseñas en cualquier módulo futuro que lo
necesite sin arrastrar conocimiento de JWT, y viceversa.

Hashing: se eligió `argon2-cffi` (Argon2id) en vez de `passlib[bcrypt]`. Argon2id es la
recomendación actual de OWASP para hashing de contraseñas (resistente a ataques por
hardware especializado, con costo de memoria configurable). `passlib` viene además
mostrando problemas de mantenimiento y de compatibilidad con versiones recientes de
`bcrypt`; usar `argon2-cffi` directamente evita esa capa intermedia sin aportar nada.

JWT: se eligió `PyJWT` en vez de `python-jose`. Ambas resuelven lo mismo (codificar y
validar JWT), pero `python-jose` tiene un historial de mantenimiento más discontinuo y
CVEs conocidos en versiones pasadas; `PyJWT` es la librería más usada y activamente
mantenida para este propósito en el ecosistema Python actual.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_password_hasher = PasswordHasher()


def hash_password(plain_password: str) -> str:
    return _password_hasher.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _password_hasher.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False


def encode_token(
    claims: dict[str, Any],
    *,
    secret_key: str,
    algorithm: str,
    expires_delta: timedelta,
) -> str:
    now = datetime.now(UTC)
    payload = {
        **claims,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def decode_token(token: str, *, secret_key: str, algorithm: str) -> dict[str, Any]:
    """Levanta `jwt.InvalidTokenError` (o una subclase) si el token es inválido o expiró.

    La responsabilidad de decidir qué hacer ante un token inválido (qué excepción de
    dominio levantar, qué mensaje devolver al cliente) es de quien llama a esta función,
    no de acá — acá solo se valida la firma y la expiración.
    """
    return jwt.decode(token, secret_key, algorithms=[algorithm])
