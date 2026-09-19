import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCardPaymentBrick } from './mercadopagoBrick';

/**
 * Regresión: el SDK real de Mercado Pago exige que `callbacks.onReady`/`callbacks.
 * onError` sean funciones -- pasarle `undefined` (cuando `GarantiaGate` no necesita
 * reaccionar a alguno de los dos) hace fallar `create()` con
 * "Callbacks onReady and/or onError are required.", reproducido en producción/dev real
 * (nunca en los tests que mockean `mountCardPaymentBrick` entero, como
 * `GarantiaGate.mercadopago.test.tsx` -- por eso este archivo prueba la función real).
 */
describe('mountCardPaymentBrick', () => {
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createMock = vi.fn().mockResolvedValue({ unmount: vi.fn() });
    // Función regular, no arrow -- `new` sobre un mock necesita algo invocable como
    // constructor (una arrow function nunca lo es, `new` tira "is not a constructor").
    window.MercadoPago = vi.fn().mockImplementation(function () {
      return { bricks: () => ({ create: createMock }) };
    }) as unknown as Window['MercadoPago'];
  });

  afterEach(() => {
    delete (window as { MercadoPago?: unknown }).MercadoPago;
  });

  it('nunca pasa onReady/onError como undefined, aunque el caller no los provea', async () => {
    await mountCardPaymentBrick({
      containerId: 'container-1',
      publicKey: 'TEST-KEY',
      amount: 1000,
      callbacks: { onSubmit: vi.fn() },
    });

    const settings = createMock.mock.calls[0][2];
    expect(typeof settings.callbacks.onReady).toBe('function');
    expect(typeof settings.callbacks.onError).toBe('function');
    expect(() => settings.callbacks.onReady()).not.toThrow();
    expect(() => settings.callbacks.onError(new Error('x'))).not.toThrow();
  });

  it('usa los callbacks provistos por el caller cuando existen', async () => {
    const onReady = vi.fn();
    const onError = vi.fn();

    await mountCardPaymentBrick({
      containerId: 'container-2',
      publicKey: 'TEST-KEY',
      amount: 1000,
      callbacks: { onSubmit: vi.fn(), onReady, onError },
    });

    const settings = createMock.mock.calls[0][2];
    settings.callbacks.onReady();
    settings.callbacks.onError(new Error('x'));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('pasa el monto e id de contenedor correctos al Brick', async () => {
    await mountCardPaymentBrick({
      containerId: 'my-container',
      publicKey: 'TEST-KEY',
      amount: 50000,
      callbacks: { onSubmit: vi.fn() },
    });

    expect(createMock).toHaveBeenCalledWith(
      'cardPayment',
      'my-container',
      expect.objectContaining({ initialization: { amount: 50000 } }),
    );
  });
});
