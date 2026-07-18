/**
 * Tipos del protocolo de TRANSPORTE del Gateway WebSocket (Épica 3, Módulo 3.3/3.4) --
 * mismo protocolo que documentan `docs/20-gateway-websocket.md` y
 * `docs/21-sistema-de-salas.md`, reflejado acá campo por campo desde
 * `backend/app/websocket/messages.py` (sin cambios en el backend). Ningún tipo de acá
 * conoce eventos de dominio (`domain_event`) ni el snapshot (`snapshot`) -- esos son
 * mensajes propios de `features/sala/realtime/`, no del transporte genérico.
 */

/** Estado de la conexión, expuesto para indicadores visuales (Épica 4, Módulo 4.6). */
export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

interface WSMessageBase {
  schema_version: number;
  type: string;
}

export interface ConnectedMessage extends WSMessageBase {
  type: 'connected';
  connection_id: string;
  user_id: string;
}

export interface PingMessage extends WSMessageBase {
  type: 'ping';
}

export interface ErrorMessage extends WSMessageBase {
  type: 'error';
  code: string;
  message: string;
}

export interface RoomJoinedMessage extends WSMessageBase {
  type: 'room_joined';
  remate_id: string;
}

export interface RoomLeftMessage extends WSMessageBase {
  type: 'room_left';
  remate_id: string;
}
