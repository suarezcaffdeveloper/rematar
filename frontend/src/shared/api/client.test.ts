import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { apiClient, registerSessionAccessor, type SessionAccessor } from './client';

describe('apiClient interceptors', () => {
  let mock: MockAdapter;
  let accessor: SessionAccessor;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    accessor = {
      getAccessToken: vi.fn(() => 'access-token-1'),
      refreshSession: vi.fn(),
      onRefreshFailed: vi.fn(),
    };
    registerSessionAccessor(accessor);
  });

  afterEach(() => {
    mock.restore();
    // Deja el accessor en un estado neutro para no filtrar mocks entre tests.
    registerSessionAccessor({
      getAccessToken: () => null,
      refreshSession: () => Promise.reject(new Error('sin accessor registrado')),
      onRefreshFailed: () => undefined,
    });
  });

  it('adjunta el access token en cada request saliente', async () => {
    mock.onGet('/remates').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer access-token-1');
      return [200, { ok: true }];
    });

    await apiClient.get('/remates');
  });

  it('no adjunta Authorization en endpoints de sesión', async () => {
    mock.onPost('/auth/login').reply((config) => {
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, {}];
    });

    await apiClient.post('/auth/login', {});
  });

  it('ante un 401, refresca la sesión una vez y reintenta la request original', async () => {
    // El mock imita lo que hace el store real: `getAccessToken` refleja el token
    // vigente, que cambia una vez que `refreshSession` resuelve -- si no, el
    // interceptor de REQUEST (que corre de nuevo en el reintento) pisaría el header
    // que el interceptor de RESPONSE ya había puesto con el token nuevo.
    let currentToken = 'access-token-1';
    accessor.getAccessToken = vi.fn(() => currentToken);
    accessor.refreshSession = vi.fn(async () => {
      currentToken = 'access-token-2';
      return currentToken;
    });
    let attempt = 0;

    mock.onGet('/remates').reply((config) => {
      attempt += 1;
      if (attempt === 1) {
        expect(config.headers?.Authorization).toBe('Bearer access-token-1');
        return [401, { error: { code: 'unauthorized', message: 'Token expirado.' } }];
      }
      expect(config.headers?.Authorization).toBe('Bearer access-token-2');
      return [200, { ok: true }];
    });

    const response = await apiClient.get('/remates');

    expect(response.status).toBe(200);
    expect(accessor.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('dos 401 concurrentes disparan un único refresh (single-flight)', async () => {
    let refreshCalls = 0;
    accessor.refreshSession = vi.fn(() => {
      refreshCalls += 1;
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve('access-token-2'), 10);
      });
    });

    mock.onGet('/uno').replyOnce(401, { error: { code: 'unauthorized', message: 'x' } });
    mock.onGet('/uno').reply(200, { ok: true });
    mock.onGet('/dos').replyOnce(401, { error: { code: 'unauthorized', message: 'x' } });
    mock.onGet('/dos').reply(200, { ok: true });

    const [uno, dos] = await Promise.all([apiClient.get('/uno'), apiClient.get('/dos')]);

    expect(uno.status).toBe(200);
    expect(dos.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  it('si el refresh falla, avisa al accessor y propaga el error original', async () => {
    accessor.refreshSession = vi.fn().mockRejectedValue(new Error('refresh token vencido'));
    mock.onGet('/remates').reply(401, { error: { code: 'unauthorized', message: 'x' } });

    await expect(apiClient.get('/remates')).rejects.toBeTruthy();
    expect(accessor.onRefreshFailed).toHaveBeenCalledTimes(1);
  });

  it('un 401 en un endpoint de sesión no dispara refresh (evita el loop)', async () => {
    mock.onPost('/auth/refresh').reply(401, { error: { code: 'unauthorized', message: 'x' } });

    await expect(apiClient.post('/auth/refresh', {})).rejects.toBeTruthy();
    expect(accessor.refreshSession).not.toHaveBeenCalled();
  });

  it('no reintenta dos veces la misma request (evita loop si el retry también da 401)', async () => {
    accessor.refreshSession = vi.fn().mockResolvedValue('access-token-2');
    mock.onGet('/remates').reply(401, { error: { code: 'unauthorized', message: 'x' } });

    await expect(apiClient.get('/remates')).rejects.toBeTruthy();
    expect(accessor.refreshSession).toHaveBeenCalledTimes(1);
  });
});
