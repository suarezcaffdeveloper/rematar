"""Normalización de texto del chat (Fase 5 de remediación del WebSocket Security Audit
-- "Chat/XSS y hardening de mensajes WebSocket"). Ver docstring de `schemas.py` y
`realtime.py` para dónde se usa.

## Por qué esto NO es un sanitizador de HTML

El chat de RematAR es -- y siempre fue -- texto plano: no hay parser de Markdown, no hay
soporte de HTML, no hay autolinking de URLs, en ningún punto del pipeline (backend ni
frontend, ver auditoría de Fase 5). La defensa real contra XSS no es "hacer que
`<script>` sea imposible de escribir" -- sería exactamente el antipatrón que pide evitar
el enunciado de esta fase (`text.replace("<script>", "")`, frágil y siempre incompleto) --
sino garantizar que el contenido NUNCA se interprete como HTML en ningún punto de la
cadena. Esa garantía la da el renderer (React, que escapa cualquier `{child}` de texto
por default -- no hay un solo `dangerouslySetInnerHTML`/`innerHTML` en todo el frontend,
verificado explícitamente en esta fase), no una lista negra de substrings acá. Por eso
`sanitize_chat_text` deliberadamente NO toca `<`, `>`, `&`, comillas, ni ningún caracter
"parecido a HTML" -- un mensaje legítimo como "5 > 3" o "AT&T" debe llegar intacto.

## Qué sí normaliza, y por qué

Caracteres de control Unicode (categoría `Cc`, U+0000-U+001F y U+007F-U+009F) no tienen
ningún uso legítimo dentro de un mensaje de chat -- ni siquiera son visibles -- pero sí
tienen usos maliciosos documentados: secuencias de escape ANSI (inyección en la terminal
de quien mira logs/DB crudos), bytes nulos (corrupción/truncamiento en herramientas que
procesan el texto más adelante), etc. Se preservan explícitamente `\n` (saltos de línea:
el chat SÍ soporta mensajes multilínea, `ChatInput.tsx` permite Shift+Enter) y `\t`.

Los caracteres explícitos de override de direccionalidad Unicode (bidi, U+202A-U+202E y
U+2066-U+2069) tampoco tienen uso legítimo en un mensaje de chat -- son el vector conocido
de "spoofing" de texto (ej. un nombre de archivo/mensaje que se lee al revés de cómo se
interpreta realmente, la misma técnica que Windows/navegadores bloquean en nombres de
archivo). Se eliminan explícitamente por nombre de code point, NO por categoría Unicode
completa (`Cf`) -- la categoría `Cf` completa incluye el ZERO WIDTH JOINER (U+200D) y los
selectores de variación (U+FE0F), imprescindibles para emojis compuestos (familias, tonos
de piel) -- eliminarla entera rompería exactamente lo que el enunciado pide no romper
("no rompas emojis ni idiomas internacionales").

No se toca ninguna letra/script de ningún idioma -- ni siquiera combining marks (tildes,
diacríticos compuestos) -- solo estos dos grupos explícitos de code points sin uso
legítimo en texto de chat.
"""

# C0 (0x00-0x1F) + DEL (0x7F) + C1 (0x80-0x9F), excepto '\n' (0x0A) y '\t' (0x09) --
# ver docstring del módulo.
_CONTROL_CHARS_TO_STRIP = frozenset(
    chr(code)
    for code in (*range(0x00, 0x20), 0x7F, *range(0x80, 0xA0))
    if code not in (0x0A, 0x09)
)

# Overrides/embeddings explícitos de direccionalidad bidi -- ver docstring del módulo.
_BIDI_CONTROL_CHARS = frozenset(
    "‪‫‬‭‮⁦⁧⁨⁩"
)

_CHARS_TO_STRIP = _CONTROL_CHARS_TO_STRIP | _BIDI_CONTROL_CHARS


def sanitize_chat_text(value: str) -> str:
    """Normaliza `\\r\\n`/`\\r` a `\\n` y elimina caracteres de control/bidi-override --
    ver docstring del módulo. No hace `strip()` ni valida longitud/vacío -- eso sigue
    siendo responsabilidad del caller (`ChatMessageCreate` para mensajes de usuario,
    `ChatSystemEventDispatcher` para mensajes de sistema)."""
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    return "".join(ch for ch in normalized if ch not in _CHARS_TO_STRIP)
