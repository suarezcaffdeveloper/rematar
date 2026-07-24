/**
 * Tipos que reflejan `backend/app/moderation/schemas.py` (Épica 7, Módulo 7.6).
 */

export interface ConnectedBuyer {
  user_id: string;
  full_name: string | null;
  connected_at: string;
  is_muted: boolean;
}

export interface PinnedMessage {
  message_id: string;
  content: string | null;
  author_name: string | null;
  pinned_by: string | null;
  pinned_at: string;
}

export interface KickRequest {
  user_id: string;
  reason?: string;
}

export interface MuteRequest {
  user_id: string;
  duration_seconds: number;
}

export interface LockChatRequest {
  duration_seconds: number;
}
