import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PlaceBidButton, type PlaceBidButtonProps } from './PlaceBidButton';
import { formatCurrency } from '../../../shared/lib/format';
import type { Lote } from '../../remates/types';

// `PlaceBidButton` usa `useNavigate`/`useLocation` (visitante anónimo, ADR-049) --
// necesita un Router alrededor incluso en los casos que no lo ejercitan.
function renderButton(overrides: Partial<PlaceBidButtonProps> = {}) {
  return render(
    <MemoryRouter>
      <PlaceBidButton {...makeProps(overrides)} />
    </MemoryRouter>,
  );
}

const { placeBidRequestMock, toastPushMock } = vi.hoisted(() => ({
  placeBidRequestMock: vi.fn(),
  toastPushMock: vi.fn(),
}));

vi.mock('../api', () => ({ placeBidRequest: placeBidRequestMock }));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'open',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<PlaceBidButtonProps> = {}): PlaceBidButtonProps {
  return {
    remateId: 'remate-1',
    lote: makeLote(),
    currency: 'ARS',
    winningOffer: null,
    remateStatus: 'live',
    viewerRole: 'comprador',
    isLeadingBidder: false,
    ...overrides,
  };
}

const acceptedResult = {
  id: 'oferta-1',
  lote_id: 'lote-1',
  buyer_id: 'buyer-1',
  amount: '1000.00',
  status: 'accepted' as const,
  rejection_reason: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

describe('PlaceBidButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('precarga el monto sugerido con el mínimo válido', () => {
    renderButton();
    // Agrupado de a miles (auditoría mobile -- antes mostraba el monto crudo sin
    // formatear, inconsistente con el resto de la sala): el input no está enfocado en
    // este test, así que muestra el valor formateado, no el "limpio" que maneja el
    // estado interno (ver `handleSubmit`/`isPositiveDecimal` más abajo, que sí siguen
    // trabajando con el valor sin agrupar).
    expect(screen.getByLabelText(/Tu oferta/)).toHaveValue('1.000,00');
  });

  it('un monto por debajo del mínimo muestra error y deshabilita el envío', async () => {
    renderButton();
    const input = screen.getByLabelText(/Tu oferta/);
    await userEvent.clear(input);
    await userEvent.type(input, '500');

    expect(screen.getByText(/El monto debe ser al menos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeDisabled();
  });

  it('al ofertar un monto válido y aceptado, confirma con un toast de éxito', async () => {
    placeBidRequestMock.mockResolvedValueOnce(acceptedResult);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Ofertar' }));

    expect(placeBidRequestMock).toHaveBeenCalledWith(
      'remate-1',
      'lote-1',
      '1000.00',
      expect.any(String),
    );
    await waitFor(() => expect(toastPushMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled();
    expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('aceptada'));
  });

  it('si el backend rechaza la oferta, muestra el motivo en un toast de error y conserva el monto', async () => {
    placeBidRequestMock.mockResolvedValueOnce({
      ...acceptedResult,
      status: 'rejected',
      rejection_reason: 'El monto debe ser al menos 1050.00 (incremento mínimo no alcanzado).',
    });
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Ofertar' }));

    await waitFor(() => expect(toastPushMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled();
    expect(toastPushMock).toHaveBeenCalledWith(
      'error',
      'El monto debe ser al menos 1050.00 (incremento mínimo no alcanzado).',
    );
    expect(screen.getByLabelText(/Tu oferta/)).toHaveValue('1.000,00');
  });

  it('si la llamada falla (red/HTTP), muestra un toast de error genérico', async () => {
    placeBidRequestMock.mockRejectedValueOnce(new Error('network down'));
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Ofertar' }));

    await waitFor(() => expect(toastPushMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled();
    expect(toastPushMock).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('reintentar el mismo monto reutiliza el mismo client_token', async () => {
    placeBidRequestMock.mockResolvedValueOnce({
      ...acceptedResult,
      status: 'rejected',
      rejection_reason: 'rechazada',
    });
    placeBidRequestMock.mockResolvedValueOnce(acceptedResult);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Ofertar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Ofertar' }));
    await waitFor(() => expect(placeBidRequestMock).toHaveBeenCalledTimes(2));

    const firstToken = placeBidRequestMock.mock.calls[0][3];
    const secondToken = placeBidRequestMock.mock.calls[1][3];
    expect(secondToken).toBe(firstToken);
  });

  it('elegir una oferta sugerida completa el input, pero no manda la oferta', async () => {
    renderButton({ lote: makeLote({ base_price: '20000.00', min_increment: '2000.00' }) });

    await userEvent.click(screen.getByRole('button', { name: formatCurrency('24000.00', 'ARS') }));

    expect(screen.getByLabelText(/Tu oferta/)).toHaveValue('24.000,00');
    expect(placeBidRequestMock).not.toHaveBeenCalled();
  });

  it('no es comprador -- el formulario no se muestra, solo un botón deshabilitado', () => {
    renderButton({ viewerRole: 'rematador' });
    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
    expect(screen.queryByLabelText(/Tu oferta/)).not.toBeInTheDocument();
  });

  it('remate no vivo -- el formulario no se muestra', () => {
    renderButton({ remateStatus: 'paused' });
    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
  });

  it('lote no abierto -- el formulario no se muestra', () => {
    renderButton({ lote: makeLote({ status: 'closed_sold' }) });
    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
  });

  it('visitante anónimo (sin rol) -- muestra un llamado a iniciar sesión, no el mensaje de permisos', () => {
    renderButton({ viewerRole: undefined });
    expect(screen.getByRole('button', { name: 'Iniciá sesión para ofertar' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tu oferta/)).not.toBeInTheDocument();
    expect(screen.queryByText('Solo los compradores pueden ofertar en la sala.')).not.toBeInTheDocument();
  });

  it('va liderando -- muestra el aviso en vez del monto sugerido/las ofertas rápidas', () => {
    renderButton({ isLeadingBidder: true });

    expect(screen.getByText('Vas liderando este lote')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tu oferta/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ofertar de todos modos' })).toBeInTheDocument();
  });

  it('va liderando -- "Ofertar de todos modos" vuelve a mostrar el formulario de siempre, sin ofertar todavía', async () => {
    renderButton({ isLeadingBidder: true });

    await userEvent.click(screen.getByRole('button', { name: 'Ofertar de todos modos' }));

    expect(screen.queryByText('Vas liderando este lote')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Tu oferta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeInTheDocument();
    expect(placeBidRequestMock).not.toHaveBeenCalled();
  });
});
