"""Schemas Pydantic compartidos entre módulos.

Solo viven acá los schemas que son genuinamente transversales (el sobre de error, la
paginación). Un schema específico de un dominio (ej. `UserRead`) vive en el módulo dueño
de ese dominio (`app/modules/users/schemas.py`), no acá — este archivo no es un cajón de
sastre para "todos los schemas", es exclusivamente para lo reutilizable entre módulos.
"""

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: object | None = None


class ErrorResponse(BaseModel):
    """Forma exacta que devuelve `core/exceptions.py` ante cualquier error de la API."""

    error: ErrorDetail


class Page[T](BaseModel):
    """Envoltorio genérico de paginación, parametrizado por el tipo de item."""

    items: list[T]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
