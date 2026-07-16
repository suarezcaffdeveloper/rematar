import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { normalizeApiError } from './errors';

function makeAxiosError(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed', String(status));
  error.response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  };
  return error;
}

describe('normalizeApiError', () => {
  it('extrae code/message/details del envelope del backend', () => {
    const error = makeAxiosError(404, {
      error: { code: 'not_found', message: 'Remate no encontrado.', details: { foo: 'bar' } },
    });

    expect(normalizeApiError(error)).toEqual({
      status: 404,
      code: 'not_found',
      message: 'Remate no encontrado.',
      details: { foo: 'bar' },
    });
  });

  it('devuelve un error de red cuando no hubo respuesta del servidor', () => {
    const error = new AxiosError('Network Error');
    // Sin `error.response` -- caído, timeout, CORS, sin conexión.

    const result = normalizeApiError(error);

    expect(result.status).toBeNull();
    expect(result.code).toBe('network_error');
  });

  it('cae a un mensaje genérico si la respuesta no trae el envelope esperado', () => {
    const error = makeAxiosError(500, { unexpected: 'shape' });

    const result = normalizeApiError(error);

    expect(result.status).toBe(500);
    expect(result.code).toBe('http_error');
    expect(result.message).toContain('500');
  });

  it('devuelve un error genérico si ni siquiera es un AxiosError', () => {
    const result = normalizeApiError(new Error('algo explotó en JS puro'));

    expect(result.code).toBe('unknown_error');
    expect(result.status).toBeNull();
  });
});
