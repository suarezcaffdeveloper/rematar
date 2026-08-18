/**
 * Tipos que reflejan `backend/app/modules/chat/schemas.py` (Épica 6, Módulo 6.4).
 */

import type { UserRole } from '../auth/types';

export type ChatMessageKind = 'user' | 'system';

/**
 * `ChatMessageRead` -- `backend/app/modules/chat/schemas.py`. `author_id`/`author_name`/
 * `author_role` son `null` para `kind: 'system'`. `content` es `null` cuando
 * `is_deleted: true` -- el backend nunca manda un placeholder de texto, el copy
 * ("Mensaje eliminado") es decisión de acá (ver `ChatMessageItem.tsx`).
 */
export interface ChatMessage {
  id: string;
  remate_id: string;
  kind: ChatMessageKind;
  author_id: string | null;
  author_name: string | null;
  author_role: UserRole | null;
  /** Foto de perfil VIGENTE del autor -- `null` si nunca eligió una (avatar por
   * defecto, iniciales) o si el mensaje es de sistema. A diferencia de
   * `author_name`/`author_role`, el backend la resuelve en vivo en cada lectura (nunca
   * se persiste junto al mensaje), así que un cambio de foto de perfil se ve reflejado
   * también en mensajes viejos -- ver `backend/app/modules/chat/schemas.py::ChatMessageRead`.
   * Mismos dos formatos que `User.avatar_url` (`features/auth/types.ts`): interpretado
   * por `shared/components/UserAvatar.tsx`. */
  author_avatar_url: string | null;
  content: string | null;
  system_event_type: string | null;
  is_deleted: boolean;
  created_at: string;
  /** Módulo de Bots Simuladores -- `true` si el mensaje lo generó un simulador,
   * resuelto por el backend en el historial (`GET .../chat/messages`, ver
   * `backend/app/modules/chat/router.py`). No llega en los eventos de WebSocket en
   * tiempo real, solo en la carga inicial del historial. */
  is_bot?: boolean;
}

/** Alguien escribiendo, mantenido en memoria por `useChatMessages` -- nunca persiste,
 * se autolimpia si no se repite (ver `hooks.ts`). */
export interface TypingUser {
  user_id: string;
  user_name: string;
  lastSeenAt: number;
}
