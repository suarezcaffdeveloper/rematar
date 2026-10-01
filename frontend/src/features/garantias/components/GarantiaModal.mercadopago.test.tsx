/**
 * Camino con `VITE_MERCADOPAGO_PUBLIC_KEY` configurada -- archivo separado de
 * `GarantiaModal.test.tsx` porque necesita mockear `shared/config/env` (module-scoped,
 * `vi.mock` no puede variar por test dentro del mismo archivo). Los Secure Fields reales
 * de Mercado Pago (`mercadopagoFields.ts`) se mockean: estos tests nunca cargan
 * `sdk.mercadopago.com` ni renderizan un iframe real, solo verifican que `GarantiaModal`
 * le pasa los datos correctos y reacciona bien a sus callbacks (foco/validez/BIN).
 */
import { StrictMode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GarantiaModal } from './GarantiaModal';
import type { Garantia } from '../types';
import type { SecureFieldsCallbacks } from '../mercadopagoFields';

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
  mountSecureFieldsMock,
  createCardPaymentDataMock,
} = vi.hoisted(() => ({
  fetchMyGarantiaRequestMock: vi.fn(),
  createGarantiaRequestMock: vi.fn(),
  toastPushMock: vi.fn(),
  mountSecureFieldsMock: vi.fn(),
  createCardPaymentDataMock: vi.fn(),
}));

vi.mock('../api', () => ({
  fetchMyGarantiaRequest: fetchMyGarantiaRequestMock,
  createGarantiaRequest: createGarantiaRequestMock,
}));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));
vi.mock('../mercadopagoFields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mercadopagoFields')>()),
  mountSecureFields: mountSecureFieldsMock,
}));

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

/** Captura los `callbacks` que `GarantiaModal` le pasa a los Secure Fields -- así el
 * test simula al SDK (foco, validez, BIN) llamándolos directamente, sin un iframe real. */
function captureFieldCallbacks(): () => SecureFieldsCallbacks {
  let callbacks: SecureFieldsCallbacks | undefined;
  mountSecureFieldsMock.mockImplementation(async (params: { callbacks: SecureFieldsCallbacks }) => {
    callbacks = params.callbacks;
    return { createCardPaymentData: createCardPaymentDataMock, unmount: vi.fn() };
  });
  return () => {
    if (!callbacks) throw new Error('Los campos seguros todavía no se montaron.');
    return callbacks;
  };
}

function renderModal(overrides: Partial<Parameters<typeof GarantiaModal>[0]> = {}) {
  return render(
    <GarantiaModal
      isOpen
      onClose={vi.fn()}
      remateId="remate-1"
      amount="50000.00"
      currency="ARS"
      onResolved={vi.fn()}
      {...overrides}
    />,
  );
}

async function openCardStep() {
  await waitFor(() => screen.getByRole('button', { name: 'Entiendo, continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Entiendo, continuar' }));
}

async function fillHolderAndDni() {
  await userEvent.type(screen.getByLabelText('Titular'), 'Juan Perez');
  await userEvent.type(screen.getByLabelText('DNI del titular'), '30123456');
}

describe('GarantiaModal -- con Mercado Pago configurado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCardPaymentDataMock.mockResolvedValue({ token: 'tok-1' });
  });

  it('monta los campos seguros con la clave pública correcta', async () => {
    captureFieldCallbacks();
    renderModal();

    await openCardStep();

    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));
    expect(mountSecureFieldsMock.mock.calls[0][0].publicKey).toBe('TEST-PUBLIC-KEY');
  });

  it('el botón de confirmar exige titular y DNI válidos', async () => {
    captureFieldCallbacks();
    renderModal();
    await openCardStep();
    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));

    const confirm = screen.getByRole('button', { name: 'Confirmar garantía' });
    expect(confirm).toBeDisabled();
    await fillHolderAndDni();
    expect(confirm).toBeEnabled();
  });

  it('tarjeta autorizada de inmediato -- notifica la resolución, muestra el éxito y luego cierra el diálogo', async () => {
    captureFieldCallbacks();
    createGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'active' }));
    const onResolved = vi.fn();
    const onClose = vi.fn();
    renderModal({ onResolved, onClose });
    await openCardStep();
    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));
    await fillHolderAndDni();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar garantía' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' })));
    expect(createCardPaymentDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cardholderName: 'Juan Perez',
        identificationType: 'DNI',
        identificationNumber: '30123456',
      }),
    );
    expect(createGarantiaRequestMock).toHaveBeenCalledWith('remate-1', { token: 'tok-1' });
    expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('activa'));
    // Primero se ve el resultado dentro del diálogo -- recién después de que el
    // formulario termina de "succionarse" hacia el centro y sale el tilde (~1.36s,
    // tiempos reales: este test no usa fake timers), no en el mismo tick que `onResolved`.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Garantía activa')).toBeInTheDocument(), { timeout: 3000 });
    // ...y la secuencia de salida de `GarantiaCardStage` dispara el cierre (`onClose`)
    // recién al arrancar su tramo final -- el diálogo se retira con su animación, no de
    // golpe.
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 9000 });
  }, 15000);

  it('tarjeta rechazada -- muestra el motivo sin cerrar el diálogo', async () => {
    captureFieldCallbacks();
    createGarantiaRequestMock.mockResolvedValue(
      makeGarantia({ status: 'failed', failure_reason: 'Mercado Pago: rejected' }),
    );
    const onClose = vi.fn();
    renderModal({ onClose });
    await openCardStep();
    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));
    await fillHolderAndDni();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar garantía' }));

    await waitFor(() => expect(screen.getByText('Mercado Pago: rejected')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('error al tokenizar -- muestra el mensaje y no llama al backend', async () => {
    captureFieldCallbacks();
    createCardPaymentDataMock.mockRejectedValue([{ message: 'Número de tarjeta inválido.' }]);
    renderModal();
    await openCardStep();
    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));
    await fillHolderAndDni();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar garantía' }));

    await waitFor(() => expect(screen.getByText('Número de tarjeta inválido.')).toBeInTheDocument());
    expect(createGarantiaRequestMock).not.toHaveBeenCalled();
  });

  it('autorización pendiente -- sondea hasta que se confirma activa', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    captureFieldCallbacks();
    createGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'pending_authorization' }));
    const onResolved = vi.fn();
    renderModal({ onResolved });
    await openCardStep();
    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));
    await fillHolderAndDni();

    fetchMyGarantiaRequestMock.mockResolvedValueOnce(makeGarantia({ status: 'pending_authorization' }));
    fetchMyGarantiaRequestMock.mockResolvedValueOnce(makeGarantia({ status: 'active' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar garantía' }));
    await waitFor(() => expect(screen.getAllByText(/Procesando con Mercado Pago/).length).toBeGreaterThan(0));

    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' })));
    vi.useRealTimers();
  });

  it('bajo StrictMode (doble montaje de efectos), monta los campos una sola vez', async () => {
    // Regresión: sin el guard de `hasStartedMountRef` en el paso de tarjeta, el doble
    // disparo de efectos que simula StrictMode en desarrollo iniciaba dos montajes en
    // paralelo sobre los mismos contenedores -- causaba "Failed to execute 'removeChild'"
    // en el SDK real (acá no se reproduce el error, mockeado, pero si el componente
    // volviera a montar dos veces esta prueba lo detecta).
    captureFieldCallbacks();
    render(
      <StrictMode>
        <GarantiaModal
          isOpen
          onClose={vi.fn()}
          remateId="remate-1"
          amount="50000.00"
          currency="ARS"
          onResolved={vi.fn()}
        />
      </StrictMode>,
    );

    await openCardStep();

    await waitFor(() => expect(mountSecureFieldsMock).toHaveBeenCalledTimes(1));
  });
});
