import { describe, expect, it } from 'vitest';
import { deriveWsBaseUrl, env } from './env';

describe('deriveWsBaseUrl', () => {
  it('reemplaza http:// por ws:// y agrega /ws', () => {
    expect(deriveWsBaseUrl('http://localhost:8000/api/v1')).toBe('ws://localhost:8000/api/v1/ws');
  });

  it('reemplaza https:// por wss:// (producción, detrás de TLS)', () => {
    expect(deriveWsBaseUrl('https://api.rematar.com/api/v1')).toBe('wss://api.rematar.com/api/v1/ws');
  });
});

describe('env.wsBaseUrl', () => {
  it('se deriva de apiBaseUrl (mismo host/puerto que la API HTTP, ver docs/20)', () => {
    expect(env.wsBaseUrl).toBe(deriveWsBaseUrl(env.apiBaseUrl));
  });
});
