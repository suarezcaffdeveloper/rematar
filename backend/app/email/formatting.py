"""Formateo de montos y fechas para templates de email -- a mano, sin `locale.setlocale`:
no hay garantía de que el locale `es_AR` esté instalado en el contenedor/CI que corre el
backend, así que depender de él sería un fallo intermitente esperando a pasar.
"""

from datetime import datetime
from decimal import Decimal

_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

_CURRENCY_SYMBOLS = {"ARS": "$", "USD": "US$"}


def format_currency(amount: Decimal, currency: str = "ARS") -> str:
    symbol = _CURRENCY_SYMBOLS.get(currency, f"{currency} ")
    entero = int(amount.quantize(Decimal("1")))
    con_separador_de_miles = f"{entero:,}".replace(",", ".")
    return f"{symbol}{con_separador_de_miles}"


def format_date_es(value: datetime) -> str:
    return f"{value.day} de {_MESES[value.month - 1]} de {value.year}"
