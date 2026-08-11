"""Envoltorio fino sobre Jinja2 -- separa el armado de HTML del resto del sistema
(orquestación de notificaciones, lógica de negocio de adjudicación). Un email nuevo
(bienvenida, recuperación de contraseña, pago recibido) solo agrega un template acá,
reutilizando `templates/_layout.html`.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES_DIR = Path(__file__).parent / "templates"


class EmailTemplateRenderer:
    def __init__(self) -> None:
        self._env = Environment(
            loader=FileSystemLoader(_TEMPLATES_DIR),
            autoescape=select_autoescape(["html"]),
        )

    def render(self, template_name: str, context: dict) -> str:
        template = self._env.get_template(template_name)
        return template.render(**context)
