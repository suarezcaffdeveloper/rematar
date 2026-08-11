from dataclasses import dataclass


@dataclass(frozen=True)
class NotificationResult:
    channel: str
    success: bool
    error: str | None = None
