"""Endpoint público del botón "Contactar al rematador" de la plantilla de WhatsApp.

Meta rechaza templates cuyo botón de URL apunta directo a un link `wa.me` (política
anti-"redirección a otra app de mensajería"), así que el botón del template apunta acá
(`https://<dominio-de-rematar>/r/wa/{token}`, URL dinámica con base propia del negocio,
que Meta sí aprueba) y este endpoint hace el salto final a WhatsApp.

Sin autenticación (se abre desde el teléfono del comprador, sin sesión) y sin ninguna
consulta a la base de datos: el token ya trae adentro, firmado, el destino completo
(ver `app/whatsapp/redirect_token.py`) -- no hay ningún parámetro de la request que
pueda elegir a dónde redirigir, así que esto no es un open redirect.
"""

from urllib.parse import quote

from fastapi import APIRouter, Path
from fastapi.responses import HTMLResponse, RedirectResponse, Response

import structlog

from app.core.config import get_settings
from app.whatsapp.redirect_token import WhatsAppRedirectTokenInvalidError, resolve_redirect_token

logger = structlog.get_logger(__name__)

router = APIRouter()

_INVALID_LINK_HTML = """<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Enlace inválido - RematAR</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 3rem 1rem;">
<h1>Este enlace no es válido o venció</h1>
<p>Podés ver el estado de tu compra desde tu cuenta en RematAR.</p>
</body>
</html>"""


@router.get("/r/wa/{token}", include_in_schema=False)
async def redirect_to_whatsapp(token: str = Path(...)) -> Response:
    settings = get_settings()
    try:
        payload = resolve_redirect_token(token, settings)
    except WhatsAppRedirectTokenInvalidError:
        logger.warning("whatsapp_redirect_token_invalid")
        return HTMLResponse(_INVALID_LINK_HTML, status_code=404)

    logger.info("whatsapp_redirect_followed", case_id=payload.get("case_id"))
    message = (
        f"Hola, te escribo por mi compra del lote {payload['lot_number']} en RematAR."
    )
    target_url = f"https://wa.me/{payload['phone']}?text={quote(message)}"
    return RedirectResponse(url=target_url, status_code=302)
