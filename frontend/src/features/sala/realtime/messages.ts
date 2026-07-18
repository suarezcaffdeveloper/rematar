/**
 * Envelopes de los mensajes de DOMINIO que llegan sobre el Gateway WebSocket, ya
 * unidos a la sala (Épica 4, Módulo 4.6) -- reflejan `backend/app/snapshot/messages.py`
 * (`SnapshotMessage`) y `backend/app/realtime/messages.py` (`DomainEventMessage`), sin
 * cambios en el backend. Distintos de `shared/websocket/types.ts`: esos son del
 * protocolo de TRANSPORTE (genérico, cualquier feature), estos son específicos de la
 * sala de un remate.
 */

import type { RemateStateSnapshot } from '../types';
import type { SalaDomainEvent } from './events';

/** Se manda una única vez, inmediatamente después de `room_joined` -- tanto en la
 * primera conexión como en cada reconexión posterior (nuevo `join_room` por cada
 * conexión nueva, ver `docs/23-snapshot-service.md`). Mismo `RemateStateSnapshot` que ya
 * usa `useRemateSnapshot` vía HTTP -- es la reconciliación automática tras una caída de
 * red: no hace falta ningún pedido HTTP adicional para "ponerse al día". */
export interface SnapshotWSMessage {
  schema_version: number;
  type: 'snapshot';
  data: RemateStateSnapshot;
}

export interface DomainEventWSMessage {
  schema_version: number;
  type: 'domain_event';
  event_type: string;
  remate_id: string;
  occurred_at: string;
  payload: SalaDomainEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSnapshotMessage(message: unknown): message is SnapshotWSMessage {
  return isRecord(message) && message.type === 'snapshot' && isRecord(message.data);
}

export function isDomainEventMessage(message: unknown): message is DomainEventWSMessage {
  return isRecord(message) && message.type === 'domain_event' && isRecord(message.payload);
}
