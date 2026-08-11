"""Mensaje de email, independiente de cómo se termine transportando (ver `sender.py`)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    html_body: str
    to_name: str | None = None
    text_body: str | None = None
