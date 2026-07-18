import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketClient, type WebSocketLike } from './client';

/** Doble de prueba de `WebSocket` -- expone `simulate*` para disparar los callbacks que
 * el navegador dispararía en un socket real, sin abrir ninguna conexión de verdad. */
class FakeWebSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: unknown[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = ''): void {
    this.closed = true;
    this.onclose?.({ code, reason });
  }

  simulateOpen(): void {
    this.onopen?.();
  }

  simulateMessage(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  simulateAbnormalClose(code = 1006): void {
    this.onclose?.({ code, reason: 'abnormal' });
  }
}

function setup(overrides: { token?: string | null } = {}) {
  const sockets: FakeWebSocket[] = [];
  const createSocket = vi.fn(() => {
    const socket = new FakeWebSocket();
    sockets.push(socket);
    return socket;
  });
  const token: string | null = 'token' in overrides ? (overrides.token ?? null) : 'jwt-token';
  const client = new WebSocketClient({
    url: 'ws://test/api/v1/ws',
    getToken: () => token,
    createSocket,
    baseDelayMs: 100,
    maxDelayMs: 800,
  });
  return { client, sockets, createSocket };
}

function authenticate(sockets: FakeWebSocket[], index = 0) {
  const socket = sockets[index];
  socket.simulateOpen();
  socket.simulateMessage({ schema_version: 1, type: 'connected', connection_id: 'c1', user_id: 'u1' });
  return socket;
}

describe('WebSocketClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('en connect(), abre el socket y manda el mensaje de auth con el token vigente', () => {
    const { client, sockets } = setup({ token: 'mi-jwt' });

    client.connect();
    sockets[0].simulateOpen();

    expect(sockets[0].sent).toEqual([{ schema_version: 1, type: 'auth', token: 'mi-jwt' }]);
  });

  it('pasa a "open" y resetea intentos recién al recibir "connected"', () => {
    const { client, sockets } = setup();
    const statuses: string[] = [];
    client.onStatusChange((status) => statuses.push(status));

    client.connect();
    expect(client.getStatus()).toBe('connecting');
    authenticate(sockets);

    expect(client.getStatus()).toBe('open');
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('responde "pong" a cada "ping" del servidor (heartbeat aplicativo)', () => {
    const { client, sockets } = setup();
    client.connect();
    const socket = authenticate(sockets);
    socket.sent = [];

    socket.simulateMessage({ schema_version: 1, type: 'ping' });

    expect(socket.sent).toEqual([{ schema_version: 1, type: 'pong' }]);
  });

  it('entrega cualquier mensaje (incluido domain_event/snapshot) vía onMessage, sin filtrar', () => {
    const { client, sockets } = setup();
    const received: unknown[] = [];
    client.onMessage((message) => received.push(message));

    client.connect();
    const socket = authenticate(sockets);
    const domainEvent = { schema_version: 1, type: 'domain_event', event_type: 'oferta.accepted' };
    socket.simulateMessage(domainEvent);

    // El primer mensaje recibido es "connected" (también se entrega sin filtrar).
    expect(received).toContainEqual(domainEvent);
  });

  it('joinRoom antes de estar autenticado se manda solo una vez, automáticamente, al recibir "connected"', () => {
    const { client, sockets } = setup();

    client.connect();
    client.joinRoom('remate-1');
    const socket = sockets[0];
    socket.simulateOpen();
    expect(socket.sent).toEqual([{ schema_version: 1, type: 'auth', token: 'jwt-token' }]);

    socket.simulateMessage({ schema_version: 1, type: 'connected', connection_id: 'c1', user_id: 'u1' });

    expect(socket.sent).toContainEqual({ schema_version: 1, type: 'join_room', remate_id: 'remate-1' });
    expect(socket.sent.filter((m) => (m as { type: string }).type === 'join_room')).toHaveLength(1);
  });

  it('joinRoom ya autenticado se manda de inmediato', () => {
    const { client, sockets } = setup();
    client.connect();
    const socket = authenticate(sockets);
    socket.sent = [];

    client.joinRoom('remate-1');

    expect(socket.sent).toEqual([{ schema_version: 1, type: 'join_room', remate_id: 'remate-1' }]);
  });

  it('tras una reconexión, vuelve a unirse automáticamente a la última sala pedida', () => {
    const { client, sockets } = setup();
    client.connect();
    let socket = authenticate(sockets);
    client.joinRoom('remate-1');

    socket.simulateAbnormalClose();
    vi.advanceTimersByTime(100); // primer backoff (baseDelayMs)
    socket = authenticate(sockets, 1);

    expect(socket.sent).toContainEqual({ schema_version: 1, type: 'join_room', remate_id: 'remate-1' });
  });

  it('ante un cierre anormal, reconecta con backoff exponencial (100 -> 200 -> 400 -> 800 tope)', () => {
    const { client, sockets, createSocket } = setup();
    client.connect();
    let socket = authenticate(sockets);

    socket.simulateAbnormalClose();
    expect(client.getStatus()).toBe('reconnecting');
    expect(createSocket).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(99);
    expect(createSocket).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(createSocket).toHaveBeenCalledTimes(2);

    socket = sockets[1];
    socket.simulateAbnormalClose(); // nunca llegó a autenticarse -- sigue en el mismo intento
    vi.advanceTimersByTime(200);
    expect(createSocket).toHaveBeenCalledTimes(3);

    sockets[2].simulateAbnormalClose();
    vi.advanceTimersByTime(400);
    expect(createSocket).toHaveBeenCalledTimes(4);

    sockets[3].simulateAbnormalClose();
    vi.advanceTimersByTime(800); // tope (maxDelayMs), no sigue creciendo
    expect(createSocket).toHaveBeenCalledTimes(5);
  });

  it('resetea el contador de reintentos apenas una reconexión vuelve a autenticarse', () => {
    const { client, sockets, createSocket } = setup();
    client.connect();
    let socket = authenticate(sockets);
    socket.simulateAbnormalClose();
    vi.advanceTimersByTime(100);
    socket = authenticate(sockets, 1); // reconectó y se autenticó -- contador vuelve a 0

    socket.simulateAbnormalClose();
    vi.advanceTimersByTime(99);
    expect(createSocket).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1); // si no hubiera reseteado, el próximo delay sería 200
    expect(createSocket).toHaveBeenCalledTimes(3);
  });

  it('disconnect() cierra sin reconectar', () => {
    const { client, sockets, createSocket } = setup();
    client.connect();
    const socket = authenticate(sockets);

    client.disconnect();

    expect(socket.closed).toBe(true);
    expect(client.getStatus()).toBe('closed');
    vi.advanceTimersByTime(10_000);
    expect(createSocket).toHaveBeenCalledTimes(1);
  });

  it('sin token, no abre ningún socket y queda "closed"', () => {
    const { client, createSocket } = setup({ token: null });

    client.connect();

    expect(createSocket).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe('closed');
  });

  it('onStatusChange/onMessage devuelven una función de desuscripción', () => {
    const { client, sockets } = setup();
    const statusListener = vi.fn();
    const unsubscribe = client.onStatusChange(statusListener);

    unsubscribe();
    client.connect();
    sockets[0].simulateOpen();

    expect(statusListener).not.toHaveBeenCalled();
  });
});
