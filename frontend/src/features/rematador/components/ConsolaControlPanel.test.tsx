import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolaControlPanel } from './ConsolaControlPanel';
import type { Lote, Remate } from '../../remates/types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: {
    openLoteRequest: vi.fn(),
    openNextLoteRequest: vi.fn(),
    closeLoteRequest: vi.fn(),
    pauseRemateRequest: vi.fn(),
    resumeRemateRequest: vi.fn(),
    finishRemateRequest: vi.fn(),
  },
  toastPushMock: vi.fn(),
}));

vi.mock('../../remates/api', () => apiMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-07-18T10:00:00Z',
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

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
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof ConsolaControlPanel>[0]> = {}) {
  return render(
    <ConsolaControlPanel
      remate={makeRemate()}
      activeLote={null}
      winningOffer={null}
      recentOffers={[]}
      selectedLoteId={null}
      hasUpcomingLotes={false}
      {...props}
    />,
  );
}

describe('ConsolaControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('remate "live" sin lote activo ni selección: solo "Pasar al siguiente lote" puede habilitarse (con próximos)', () => {
    renderPanel({ hasUpcomingLotes: true });

    expect(screen.getByRole('button', { name: 'Abrir lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pasar al siguiente lote' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar remate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reanudar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeEnabled();
  });

  it('con un lote seleccionado, "Abrir lote" se habilita', () => {
    renderPanel({ selectedLoteId: 'lote-9', hasUpcomingLotes: true });
    expect(screen.getByRole('button', { name: 'Abrir lote' })).toBeEnabled();
  });

  it('con un lote activo, "Abrir"/"Finalizar" se deshabilitan pero "Cerrar lote" y "Pasar al siguiente lote" siguen disponibles', () => {
    renderPanel({ activeLote: makeLote(), selectedLoteId: 'lote-9', hasUpcomingLotes: true });

    expect(screen.getByRole('button', { name: 'Abrir lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeEnabled();
    // "Pasar al siguiente lote" ahora también adjudica el lote activo antes de abrir el
    // siguiente (ver describe "Pasar al siguiente lote con un lote activo" más abajo) --
    // por eso queda habilitado en vez de deshabilitarse como antes.
    expect(screen.getByRole('button', { name: 'Pasar al siguiente lote' })).toBeEnabled();
  });

  it('remate "paused": "Reanudar" habilitado, "Pausar"/"Abrir"/"Finalizar" deshabilitados, "Cerrar lote" sigue disponible', () => {
    renderPanel({ remate: makeRemate({ status: 'paused' }), activeLote: makeLote() });

    expect(screen.getByRole('button', { name: 'Reanudar remate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pausar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeEnabled();
  });

  it('"Pausar remate" pide confirmación en un modal -- no llama al endpoint hasta confirmar', async () => {
    apiMocks.pauseRemateRequest.mockResolvedValue(makeRemate({ status: 'paused' }));
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Pausar remate' }));
    expect(apiMocks.pauseRemateRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Remate de hacienda');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(apiMocks.pauseRemateRequest).toHaveBeenCalledWith('remate-1');
    expect(toastPushMock).toHaveBeenCalledWith('success', 'El remate se pausó.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Pausar remate" -- cancelar el modal no llama al endpoint', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Pausar remate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(apiMocks.pauseRemateRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Finalizar remate" pide confirmación en un modal -- si se cancela, no llama al endpoint', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Finalizar remate' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('no se puede deshacer');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(apiMocks.finishRemateRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Finalizar remate" -- confirmar en el modal sí llama al endpoint', async () => {
    apiMocks.finishRemateRequest.mockResolvedValue(makeRemate({ status: 'finished' }));
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Finalizar remate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(apiMocks.finishRemateRequest).toHaveBeenCalledWith('remate-1');
    expect(toastPushMock).toHaveBeenCalledWith('success', 'El remate se finalizó.');
  });

  it('"Abrir lote" llama a openLoteRequest con el lote seleccionado', async () => {
    apiMocks.openLoteRequest.mockResolvedValue(makeLote({ status: 'open' }));
    renderPanel({ selectedLoteId: 'lote-9', hasUpcomingLotes: true });

    await userEvent.click(screen.getByRole('button', { name: 'Abrir lote' }));

    expect(apiMocks.openLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-9');
  });

  it('"Pasar al siguiente lote" llama a openNextLoteRequest', async () => {
    apiMocks.openNextLoteRequest.mockResolvedValue(makeLote({ status: 'open' }));
    renderPanel({ hasUpcomingLotes: true });

    await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente lote' }));

    expect(apiMocks.openNextLoteRequest).toHaveBeenCalledWith('remate-1');
  });

  describe('"Pasar al siguiente lote" con un lote activo (adjudicación automática)', () => {
    function makeWinningOffer() {
      return {
        id: 'oferta-1',
        buyer_id: 'buyer-1',
        amount: '1500.00',
        status: 'accepted' as const,
        created_at: '2026-07-01T00:00:00Z',
      };
    }

    it('con oferta ganadora, cierra el lote como vendido por ese monto y recién después abre el siguiente', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_sold' }));
      apiMocks.openNextLoteRequest.mockResolvedValue(makeLote({ status: 'open' }));
      renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), hasUpcomingLotes: true });

      await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente lote' }));

      expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
        outcome: 'sold',
        final_price: '1500.00',
      });
      expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('adjudicado'));
      await waitFor(() => expect(apiMocks.openNextLoteRequest).toHaveBeenCalledWith('remate-1'));
    });

    it('sin ninguna oferta, cierra el lote como desierto (sin precio) y abre el siguiente', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_unsold' }));
      apiMocks.openNextLoteRequest.mockResolvedValue(makeLote({ status: 'open' }));
      renderPanel({ activeLote: makeLote(), winningOffer: null, hasUpcomingLotes: true });

      await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente lote' }));

      expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
        outcome: 'unsold',
        final_price: undefined,
      });
      expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('desierto'));
      await waitFor(() => expect(apiMocks.openNextLoteRequest).toHaveBeenCalledWith('remate-1'));
    });

    it('sin lotes próximos, solo cierra el lote activo -- no intenta abrir el siguiente', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_sold' }));
      renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), hasUpcomingLotes: false });

      await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente lote' }));

      await waitFor(() => expect(apiMocks.closeLoteRequest).toHaveBeenCalled());
      expect(apiMocks.openNextLoteRequest).not.toHaveBeenCalled();
    });

    it('si falla el cierre, no intenta abrir el siguiente lote', async () => {
      apiMocks.closeLoteRequest.mockRejectedValue({
        isAxiosError: true,
        response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo cerrar.' } } },
      });
      renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), hasUpcomingLotes: true });

      await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente lote' }));

      await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se pudo cerrar.'));
      expect(apiMocks.openNextLoteRequest).not.toHaveBeenCalled();
    });
  });

  describe('Cerrar lote', () => {
    it('abre un formulario en línea, con "Vendido" seleccionado por default', async () => {
      renderPanel({ activeLote: makeLote() });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      expect(screen.getByText('Cerrar lote 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Vendido')).toBeChecked();
      expect(screen.getByLabelText('Precio final')).toBeInTheDocument();
    });

    it('con "Desierto", no pide precio final y confirma directo', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_unsold' }));
      renderPanel({ activeLote: makeLote() });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.click(screen.getByLabelText('Desierto'));
      expect(screen.queryByLabelText('Precio final')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

      expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
        outcome: 'unsold',
        final_price: undefined,
      });
    });

    it('"Vendido" con precio menor al inicial, mantiene "Confirmar cierre" deshabilitado', async () => {
      renderPanel({ activeLote: makeLote({ base_price: '1000.00' }) });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.type(screen.getByLabelText('Precio final'), '500');

      expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
      expect(apiMocks.closeLoteRequest).not.toHaveBeenCalled();
    });

    it('"Vendido" sin ingresar precio, "Confirmar cierre" queda deshabilitado', async () => {
      renderPanel({ activeLote: makeLote({ base_price: '1000.00' }) });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
    });

    it('"Vendido" con precio válido, llama a closeLoteRequest y cierra el formulario', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_sold', final_price: '1500.00' }));
      renderPanel({ activeLote: makeLote({ base_price: '1000.00' }) });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.type(screen.getByLabelText('Precio final'), '1500');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

      expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
        outcome: 'sold',
        final_price: '1500',
      });
      expect(screen.queryByText('Cerrar lote 1')).not.toBeInTheDocument();
    });

    it('"Cancelar" descarta el formulario sin llamar a ningún endpoint', async () => {
      renderPanel({ activeLote: makeLote() });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByText('Cerrar lote 1')).not.toBeInTheDocument();
      expect(apiMocks.closeLoteRequest).not.toHaveBeenCalled();
    });

    it('ante un error del backend, muestra el mensaje en el formulario (no lo cierra)', async () => {
      apiMocks.closeLoteRequest.mockRejectedValue({
        isAxiosError: true,
        response: { status: 422, data: { error: { code: 'business_rule', message: 'Precio inválido.' } } },
      });
      renderPanel({ activeLote: makeLote({ base_price: '1000.00' }) });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.type(screen.getByLabelText('Precio final'), '1500');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

      expect(screen.getByText('Precio inválido.')).toBeInTheDocument();
      expect(screen.getByText('Cerrar lote 1')).toBeInTheDocument();
    });
  });

  describe('advertencia de oferta reciente al cerrar el lote', () => {
    // Timestamps relativos a `Date.now()` en vez de `vi.useFakeTimers()` -- `userEvent`
    // depende de temporizadores reales para sus propias esperas internas entre
    // interacciones, y se cuelga si el reloj queda congelado.
    function makeRecentOffer(secondsAgo: number) {
      return {
        id: 'oferta-1',
        buyer_id: 'buyer-1',
        amount: '1500.00',
        status: 'accepted' as const,
        created_at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
      };
    }

    it('con una oferta de hace 8 segundos, muestra el modal de advertencia en vez del formulario', async () => {
      renderPanel({ activeLote: makeLote(), recentOffers: [makeRecentOffer(8)] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      expect(screen.getByRole('dialog')).toHaveTextContent('Última oferta hace 8 segundos');
      expect(screen.queryByText('Cerrar lote 1')).not.toBeInTheDocument();
    });

    it('"Cancelar" en el modal de advertencia no abre el formulario ni cierra el lote', async () => {
      renderPanel({ activeLote: makeLote(), recentOffers: [makeRecentOffer(8)] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('Cerrar lote 1')).not.toBeInTheDocument();
      expect(apiMocks.closeLoteRequest).not.toHaveBeenCalled();
    });

    it('"Continuar cierre" en el modal de advertencia abre el formulario normal', async () => {
      renderPanel({ activeLote: makeLote(), recentOffers: [makeRecentOffer(8)] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar cierre' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Cerrar lote 1')).toBeInTheDocument();
    });

    it('con una oferta de hace varios minutos, "Cerrar lote" abre el formulario directo', async () => {
      renderPanel({
        activeLote: makeLote(),
        recentOffers: [makeRecentOffer(600)],
      });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Cerrar lote 1')).toBeInTheDocument();
    });

    it('sin ofertas, "Cerrar lote" abre el formulario directo', async () => {
      renderPanel({ activeLote: makeLote(), recentOffers: [] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Cerrar lote 1')).toBeInTheDocument();
    });
  });
});
