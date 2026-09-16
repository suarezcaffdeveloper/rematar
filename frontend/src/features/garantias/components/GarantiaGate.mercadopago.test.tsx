/**
 * Camino con `VITE_MERCADOPAGO_PUBLIC_KEY` configurada -- archivo separado de
 * `GarantiaGate.test.tsx` porque necesita mockear `shared/config/env` (module-scoped,
 * `vi.mock` no puede variar por test dentro del mismo archivo). El SDK real de Mercado
 * Pago (`mercadopagoBrick.ts`) se mockea: estos tests nunca cargan `sdk.mercadopago.com`
 * ni renderizan un iframe real, solo verifican que `GarantiaGate` le pasa los datos
 * correctos y reacciona bien a sus callbacks (`onSubmit`/`onError`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GarantiaGate } from './GarantiaGate';
import type { Garantia } from '../types';
import type { CardPaymentBrickCallbacks } from '../mercadopagoBrick';

vi.mock('../../../shared/config/env', () => ({
  env: {
    apiBaseUrl: 'http://test.local',
    wsBaseUrl: 'ws://test.local',
    mercadopagoPublicKey: 'TEST-PUBLIC-KEY',
  },
}));

const {
  fetchMyGarantiaRequestMock,
  createGarantiaRequestMock,
  toastPushMock,
  mountCardPaymentBrickMock,
} = vi.hoisted(() => ({
  fetchMyGarantiaRequestMock: vi.fn(),
  createGarantiaRequestMock: vi.fn(),
  toastPushMock: vi.fn(),
  mountCardPaymentBrickMock: vi.fn(),
}));

vi.mock('../api', () => ({
  fetchMyGarantiaRequest: fetchMyGarantiaRequestMock,
  createGarantiaRequest: createGarantiaRequestMock,
}));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));
vi.mock('../mercadopagoBrick', () => ({ mountCardPaymentBrick: mountCardPaymentBrickMock }));

function makeGarantia(overrides: Partial<Garantia> = {}): Garantia {
  return {
    id: 'garantia-1',
    remate_id: 'remate-1',
    status: 'active',
    amount: '50000.00',
    currency: 'ARS',
    expires_at: '2026-08-10T00:00:00Z',
    failure_reason: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

/** Captura los `callbacks` que `GarantiaGate` le pasa al Brick -- así el test simula al
 * comprador completando el formulario llamando `capturedCallbacks().onSubmit(...)`
 * directamente, sin un iframe real. */
function captureBrickCallbacks(): () => CardPaymentBrickCallbacks {
  let callbacks: CardPaymentBrickCallbacks | undefined;
  mountCardPaymentBrickMock.mockImplementation(
    async (params: { callbacks: CardPaymentBrickCallbacks }) => {
      callbacks = params.callbacks;
      return { unmount: vi.fn() };
    },
  );
  return () => {
    if (!callbacks) throw new Error('El Brick todavía no se montó.');
    return callbacks;
  };
}

async function openCardStep() {
  await waitFor(() => screen.getByRole('button', { name: 'Constituir garantía' }));
  await userEvent.click(screen.getByRole('button', { name: 'Constituir garantía' }));
  await userEvent.click(screen.getByRole('button', { name: 'Entiendo, continuar' }));
}

describe('GarantiaGate -- con Mercado Pago configurado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monta el Brick con el monto y la clave pública correctos', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    captureBrickCallbacks();
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);

    await openCardStep();

    await waitFor(() => expect(mountCardPaymentBrickMock).toHaveBeenCalledTimes(1));
    const call = mountCardPaymentBrickMock.mock.calls[0][0];
    expect(call.publicKey).toBe('TEST-PUBLIC-KEY');
    expect(call.amount).toBe(50000);
  });

  it('tarjeta autorizada de inmediato -- resuelve activa y cierra el modal', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    const getCallbacks = captureBrickCallbacks();
    createGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'active' }));
    const onStatusChange = vi.fn();
    render(
      <GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" onStatusChange={onStatusChange} />,
    );
    await openCardStep();
    await waitFor(() => expect(mountCardPaymentBrickMock).toHaveBeenCalledTimes(1));

    await getCallbacks().onSubmit({ token: 'tok-1' });

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('active'));
    expect(createGarantiaRequestMock).toHaveBeenCalledWith('remate-1', { token: 'tok-1' });
    expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('activa'));
    // El modal se cierra -- el paso de consentimiento/tarjeta ya no está en pantalla.
    expect(screen.queryByRole('button', { name: 'Entiendo, continuar' })).not.toBeInTheDocument();
  });

  it('tarjeta rechazada -- muestra el motivo sin cerrar el modal', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    const getCallbacks = captureBrickCallbacks();
    createGarantiaRequestMock.mockResolvedValue(
      makeGarantia({ status: 'failed', failure_reason: 'Mercado Pago: rejected' }),
    );
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);
    await openCardStep();
    await waitFor(() => expect(mountCardPaymentBrickMock).toHaveBeenCalledTimes(1));

    await getCallbacks().onSubmit({ token: 'tok-1' });

    await waitFor(() => expect(screen.getByText('Mercado Pago: rejected')).toBeInTheDocument());
  });

  it('autorización pendiente -- sondea hasta que se confirma activa', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMyGarantiaRequestMock.mockResolvedValueOnce(null); // carga inicial: sin garantía.
    const getCallbacks = captureBrickCallbacks();
    createGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'pending_authorization' }));
    const onStatusChange = vi.fn();
    render(
      <GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" onStatusChange={onStatusChange} />,
    );
    await openCardStep();
    await waitFor(() => expect(mountCardPaymentBrickMock).toHaveBeenCalledTimes(1));

    fetchMyGarantiaRequestMock.mockResolvedValueOnce(makeGarantia({ status: 'pending_authorization' }));
    fetchMyGarantiaRequestMock.mockResolvedValueOnce(makeGarantia({ status: 'active' }));

    await getCallbacks().onSubmit({ token: 'tok-1' });
    await waitFor(() => expect(screen.getByText(/Procesando con Mercado Pago/)).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('active'));
    vi.useRealTimers();
  });
});
