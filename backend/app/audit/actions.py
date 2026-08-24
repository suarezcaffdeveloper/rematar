"""Catálogo de acciones auditables (Épica 7, Módulo 7.2). Ver
docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.

Namespace de string abierto (`"dominio.verbo"`), mismo criterio que
`DomainEvent.event_type` (`app/events/base.py`) -- `AuditLogEntry.action` es una columna
`String`, no un `Enum` nativo de Postgres (ADR-010): sumar una acción nueva es agregar
una constante acá, nunca una migración de `ALTER TYPE ... ADD VALUE`. Es la pieza central
de por qué este módulo es "fácilmente extensible sin modificar significativamente el
código existente".
"""


class AuditAction:
    AUTH_LOGIN = "auth.login"
    AUTH_LOGOUT = "auth.logout"
    AUTH_PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
    AUTH_PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"

    REMATE_CREATED = "remate.created"
    REMATE_UPDATED = "remate.updated"
    REMATE_SETTINGS_CHANGED = "remate.settings_changed"
    REMATE_DELETED = "remate.deleted"
    REMATE_STATUS_CHANGED = "remate.status_changed"
    REMATE_OPERATOR_CODE_GENERATED = "remate.operator_code_generated"
    REMATE_OPERATOR_CLAIMED = "remate.operator_claimed"

    LOTE_CREATED = "lote.created"
    LOTE_UPDATED = "lote.updated"
    LOTE_DELETED = "lote.deleted"
    LOTE_OPENED = "lote.opened"
    LOTE_CLOSED = "lote.closed"
    LOTE_AWARDED = "lote.awarded"
    LOTE_CANCELLED = "lote.cancelled"
    LOTE_REQUEUED = "lote.requeued"

    LOTE_TIMER_PAUSED = "lote.timer_paused"
    LOTE_TIMER_RESUMED = "lote.timer_resumed"
    LOTE_TIMER_RESET = "lote.timer_reset"
    LOTE_TIMER_ADJUSTED = "lote.timer_adjusted"
    LOTE_TIMER_AUTO_CLOSE_TOGGLED = "lote.timer_auto_close_toggled"

    OFERTA_PLACED = "oferta.placed"
    OFERTA_REJECTED = "oferta.rejected"

    CHAT_MESSAGE_DELETED = "chat.message_deleted"

    POSTAUCTION_CASE_CREATED = "postauction.case_created"
    POSTAUCTION_STATUS_CHANGED = "postauction.status_changed"
    POSTAUCTION_NOTE_ADDED = "postauction.note_added"
    POSTAUCTION_DOCUMENT_UPLOADED = "postauction.document_uploaded"
    POSTAUCTION_DOCUMENT_DELETED = "postauction.document_deleted"

    MODERATION_USER_KICKED = "moderacion.usuario_expulsado"
    MODERATION_USER_MUTED = "moderacion.usuario_silenciado"
    MODERATION_CHAT_LOCKED = "moderacion.chat_bloqueado"
    MODERATION_MESSAGE_PINNED = "moderacion.mensaje_destacado"
    MODERATION_MESSAGE_UNPINNED = "moderacion.mensaje_no_destacado"
    MODERATION_INVALID_BID_ATTEMPT = "moderacion.intento_oferta_invalida"
    MODERATION_INVALID_BID_THRESHOLD_EXCEEDED = "moderacion.umbral_ofertas_invalidas_superado"
