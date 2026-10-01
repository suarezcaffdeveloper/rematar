import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GarantiaModal } from './GarantiaModal';

const { fetchMyGarantiaRequestMock, createGarantiaRequestMock, toastPushMock } = vi.hoisted(() => ({
  fetchMyGarantiaRequestMock: vi.fn(),
  createGarantiaRequestMock: vi.fn(),
  toastPushMock: vi.fn(),
}));

vi.mock('../api', () => ({
  fetchMyGarantiaRequest: fetchMyGarantiaRequestMock,
  createGarantiaRequest: createGarantiaRequestMock,
}));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));
// `mercadopagoPublicKey: null` explícito -- este archivo prueba el camino SIN clave
// configurada; depender del `.env` real del desarrollador (que puede tenerla cargada
// para probar el flujo real, ver `GarantiaModal.mercadopago.test.tsx`) haría este test
// no determinístico según la máquina.
vi.mock('../../../shared/config/env', () => ({
  env: { apiBaseUrl: 'http://test.local', wsBaseUrl: 'ws://test.local', mercadopagoPublicKey: null },
}));

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

describe('GarantiaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cerrado (`isOpen: false`), no renderiza el diálogo', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al abrirse, muestra el paso de consentimiento antes que el formulario de tarjeta', async () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/vamos a retener/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entiendo, continuar' })).toBeInTheDocument();
  });

  it('sin clave pública de Mercado Pago configurada, el paso de tarjeta avisa que no está disponible', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Entiendo, continuar' }));

    expect(
      screen.getByText(/La carga de tarjeta no está disponible en este entorno todavía/),
    ).toBeInTheDocument();
  });

  it('cancelar en el paso de consentimiento cierra el diálogo sin llamar al backend', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createGarantiaRequestMock).not.toHaveBeenCalled();
  });

  it('cada reapertura vuelve al paso de consentimiento (no recuerda el paso anterior)', async () => {
    const { rerender } = render(
      <GarantiaModal
        isOpen
        onClose={vi.fn()}
        remateId="remate-1"
        amount="50000.00"
        currency="ARS"
        onResolved={vi.fn()}
      />,
    );

    // Avanza al paso de tarjeta (sin clave de MP configurada acá, se reconoce por el
    // aviso de "no disponible" en vez del formulario)...
    await userEvent.click(screen.getByRole('button', { name: 'Entiendo, continuar' }));
    await waitFor(() =>
      expect(screen.getByText(/La carga de tarjeta no está disponible/)).toBeInTheDocument(),
    );

    // ...cierra y reabre: vuelve al consentimiento.
    rerender(
      <GarantiaModal
        isOpen={false}
        onClose={vi.fn()}
        remateId="remate-1"
        amount="50000.00"
        currency="ARS"
        onResolved={vi.fn()}
      />,
    );
    rerender(
      <GarantiaModal
        isOpen
        onClose={vi.fn()}
        remateId="remate-1"
        amount="50000.00"
        currency="ARS"
        onResolved={vi.fn()}
      />,
    );

    expect(screen.getByText(/vamos a retener/)).toBeInTheDocument();
    expect(screen.queryByText(/La carga de tarjeta no está disponible/)).not.toBeInTheDocument();
  });
});
