import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GarantiaGate } from './GarantiaGate';
import type { Garantia } from '../types';

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
// para probar el flujo real, ver `GarantiaGate.mercadopago.test.tsx`) haría este test
// no determinístico según la máquina.
vi.mock('../../../shared/config/env', () => ({
  env: { apiBaseUrl: 'http://test.local', wsBaseUrl: 'ws://test.local', mercadopagoPublicKey: null },
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

describe('GarantiaGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mientras carga el estado inicial, muestra un aviso de verificación', () => {
    fetchMyGarantiaRequestMock.mockReturnValue(new Promise(() => {})); // nunca resuelve
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);
    expect(screen.getByText(/Verificando el estado de tu garantía/)).toBeInTheDocument();
  });

  it('sin garantía constituida, muestra el aviso con el monto y el botón para constituirla', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);

    await waitFor(() =>
      expect(screen.getByText(/Este remate exige una garantía de/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Constituir garantía' })).toBeInTheDocument();
  });

  it('con garantía activa, muestra el badge de éxito y notifica el estado hacia arriba', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'active' }));
    const onStatusChange = vi.fn();
    render(
      <GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" onStatusChange={onStatusChange} />,
    );

    await waitFor(() => expect(screen.getByText('Garantía activa para este remate.')).toBeInTheDocument());
    expect(onStatusChange).toHaveBeenCalledWith('active');
  });

  it('garantía failed se trata igual que "sin garantía" -- muestra el aviso de constituirla', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'failed', failure_reason: 'rechazada' }));
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);

    await waitFor(() =>
      expect(screen.getByText(/Este remate exige una garantía de/)).toBeInTheDocument(),
    );
  });

  it('abrir el modal muestra el paso de consentimiento antes que el formulario de tarjeta', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);

    await waitFor(() => screen.getByRole('button', { name: 'Constituir garantía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Constituir garantía' }));

    expect(screen.getByText(/vamos a retener/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entiendo, continuar' })).toBeInTheDocument();
  });

  it('sin clave pública de Mercado Pago configurada, el paso de tarjeta avisa que no está disponible', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);

    await waitFor(() => screen.getByRole('button', { name: 'Constituir garantía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Constituir garantía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Entiendo, continuar' }));

    expect(
      screen.getByText(/La carga de tarjeta no está disponible en este entorno todavía/),
    ).toBeInTheDocument();
  });

  it('cancelar en el paso de consentimiento cierra el modal sin llamar al backend', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    render(<GarantiaGate remateId="remate-1" amount="50000.00" currency="ARS" />);

    await waitFor(() => screen.getByRole('button', { name: 'Constituir garantía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Constituir garantía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/vamos a retener/)).not.toBeInTheDocument();
    expect(createGarantiaRequestMock).not.toHaveBeenCalled();
  });
});
