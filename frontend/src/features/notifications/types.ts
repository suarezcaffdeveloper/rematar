/**
 * Tipos que reflejan `backend/app/notifications/schemas.py` (Épica 7, Módulo 7.5 --
 * Notification Service, sin consumidor de frontend hasta esta etapa: Épica 9, Etapa 3).
 */
export interface Notification {
  id: string;
  created_at: string;
  type: string;
  title: string;
  message: string;
  resource_type: string | null;
  resource_id: string | null;
  remate_id: string | null;
  read_at: string | null;
}

export interface UnreadCount {
  unread_count: number;
}
