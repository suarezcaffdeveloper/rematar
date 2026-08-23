/**
 * Cliente WebSocket genérico y reutilizable (Épica 4, Módulo 4.6). Ver
 * `docs/28-websocket-tiempo-real-sala.md` y ADR-031 para el detalle completo de
 * decisiones.
 *
 * Implementa ÚNICAMENTE el protocolo de transporte del Gateway (sin conocer ningún
 * dominio): apertura de conexión, autenticación en el primer mensaje (ADR-006,
 * `docs/20-gateway-websocket.md`), heartbeat aplicativo (responde `pong` a cada
 * `ping`), unión/salida de salas (`docs/21-sistema-de-salas.md`), reconexión automática
 * con backoff exponencial (con re-unión a la sala tras reconectar), y cierre limpio.
 *
 * Deliberadamente NO interpreta `domain_event` ni `snapshot` -- esos son mensajes de
 * `features/sala/realtime/`, entregados acá tal cual (sin parsear) vía `onMessage`. Esto
 * es lo que permite que un futuro Chat/Presencia/Notificaciones reutilice esta misma
 * clase sin que este archivo necesite cambiar una línea: cada feature suscribe su propio
 * `onMessage` y filtra por `type`/`event_type` con su propio criterio.
 */

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Superficie mínima de `WebSocket` que este cliente necesita -- permite inyectar un
 * doble de prueba en los tests sin abrir una conexión de red real. */
export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface WebSocketClientOptions {
  /** URL completa (`ws://`/`wss://`) del endpoint del Gateway. */
  url: string;
  /** JWT vigente -- se llama de nuevo en cada intento de conexión (incluidos los
   * reintentos), así que un refresh de sesión en paralelo se recoge solo. */
  getToken: () => string | null;
  /** Fábrica del socket real -- por default, el `WebSocket` nativo del navegador.
   * Inyectable para tests. */
  createSocket?: (url: string) => WebSocketLike;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

type Unsubscribe = () => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class WebSocketClient {
  private readonly url: string;
  private readonly getToken: () => string | null;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  private socket: WebSocketLike | null = null;
  private status: ConnectionStatus = 'idle';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private currentRoomId: string | null = null;
  private outgoingQueue: Record<string, unknown>[] = [];
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly messageListeners = new Set<(message: unknown) => void>();

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.getToken = options.getToken;
    this.createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  /** Abre la conexión. Sin efecto si ya hay una conexión o un reintento en curso. */
  connect(): void {
    this.manualDisconnect = false;
    this.clearReconnectTimer();
    this.openSocket();
  }

  /** Cierre limpio, deliberado -- no dispara reconexión. Olvida la sala actual: un
   * `connect()` posterior empieza desde cero, no reingresa a ninguna sala sola. */
  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.currentRoomId = null;
    this.outgoingQueue = [];
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'client_disconnect');
    this.setStatus('closed');
  }

  /** Pide unirse a la sala de un remate (`docs/21-sistema-de-salas.md`). Si la conexión
   * todavía no terminó de autenticarse, se manda automáticamente apenas llegue
   * `connected` -- mismo mecanismo que reconstruye la membresía de sala después de una
   * reconexión (el `RoomManager` del backend es por conexión, una conexión nueva no
   * hereda la sala de la anterior). */
  joinRoom(remateId: string): void {
    this.currentRoomId = remateId;
    if (this.status === 'open') {
      this.socket?.send(JSON.stringify({ schema_version: 1, type: 'join_room', remate_id: remateId }));
    }
  }

  leaveRoom(): void {
    this.currentRoomId = null;
    if (this.status === 'open') {
      this.socket?.send(JSON.stringify({ schema_version: 1, type: 'leave_room' }));
    }
  }

  /** Envío genérico para cualquier mensaje que no sea `join_room`/`leave_room` --
   * punto de extensión para un futuro Chat, sin que este cliente necesite saber qué es
   * un mensaje de chat. Se encola si la conexión todavía no está abierta. */
  send(message: Record<string, unknown>): void {
    this.sendOrQueue(message);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Entrega cualquier mensaje ya parseado (JSON), sin filtrar por `type` -- cada
   * feature decide qué le importa. */
  onMessage(listener: (message: unknown) => void): Unsubscribe {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private openSocket(): void {
    // Visitante anónimo (ADR-049): `token` puede ser `null` -- ya no es motivo para no
    // abrir la conexión, solo cambia qué se manda en el mensaje `auth` de más abajo. El
    // backend acepta `token` ausente como "mirar sin sesión", nunca ofertar ni accionar
    // nada de dominio (eso lo sigue rechazando cada endpoint HTTP que lo requiera).
    const token = this.getToken();

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    const socket = this.createSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ schema_version: 1, type: 'auth', token }));
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = (event) => this.handleClose(event.code);
    // No hace falta lógica propia en `onerror`: el navegador siempre dispara `onclose`
    // justo después de un error de conexión, y ahí es donde ya se decide reconectar.
    socket.onerror = () => undefined;
  }

  private handleMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    this.messageListeners.forEach((listener) => listener(message));

    if (!isRecord(message)) return;

    if (message.type === 'connected') {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      this.flushQueue();
      if (this.currentRoomId) {
        this.socket?.send(
          JSON.stringify({ schema_version: 1, type: 'join_room', remate_id: this.currentRoomId }),
        );
      }
      return;
    }

    if (message.type === 'ping') {
      this.socket?.send(JSON.stringify({ schema_version: 1, type: 'pong' }));
    }
  }

  private handleClose(_code: number): void {
    this.socket = null;
    if (this.manualDisconnect) {
      this.setStatus('closed');
      return;
    }
    this.setStatus('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.baseDelayMs * 2 ** this.reconnectAttempts, this.maxDelayMs);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendOrQueue(message: Record<string, unknown>): void {
    if (this.status === 'open' && this.socket) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.outgoingQueue.push(message);
    }
  }

  private flushQueue(): void {
    const queued = this.outgoingQueue;
    this.outgoingQueue = [];
    queued.forEach((message) => this.socket?.send(JSON.stringify(message)));
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}
