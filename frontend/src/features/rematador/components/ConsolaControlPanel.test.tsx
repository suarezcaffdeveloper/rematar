import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    requeueLoteRequest: vi.fn(),
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
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeWinningOffer(overrides: Partial<{ amount: string; created_at: string }> = {}) {
  return {
    id: 'oferta-1',
    buyer_id: 'buyer-1',
    amount: '1500.00',
    status: 'accepted' as const,
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
    expect(screen.getByRole('button', { name: 'Adjudicar lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar remate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reanudar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeEnabled();
  });

  it('con un lote seleccionado, "Abrir lote" se habilita', () => {
    renderPanel({ selectedLoteId: 'lote-9', hasUpcomingLotes: true });
    expect(screen.getByRole('button', { name: 'Abrir lote' })).toBeEnabled();
  });

  it('con un lote activo sin ofertas: "Abrir"/"Finalizar"/"Pasar al siguiente lote"/"Adjudicar lote" deshabilitados, "Cerrar lote" disponible', () => {
    renderPanel({ activeLote: makeLote(), selectedLoteId: 'lote-9', hasUpcomingLotes: true });

    expect(screen.getByRole('button', { name: 'Abrir lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pasar al siguiente lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Adjudicar lote' })).toBeDisabled();
  });

  it('con un lote activo con oferta ganadora: "Cerrar lote" se deshabilita, "Adjudicar lote" se habilita, "Pasar al siguiente lote" sigue deshabilitado', () => {
    renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), hasUpcomingLotes: true });

    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adjudicar lote' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pasar al siguiente lote' })).toBeDisabled();
  });

  it('remate "paused": "Reanudar" habilitado, "Pausar"/"Abrir"/"Finalizar" deshabilitados, "Cerrar lote" sigue disponible (sin oferta)', () => {
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

  it('"Pasar al siguiente lote" (sin lote activo) llama a openNextLoteRequest', async () => {
    apiMocks.openNextLoteRequest.mockResolvedValue(makeLote({ status: 'open' }));
    renderPanel({ hasUpcomingLotes: true });

    await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente lote' }));

    expect(apiMocks.openNextLoteRequest).toHaveBeenCalledWith('remate-1');
  });

  it('"Pasar al siguiente lote" queda deshabilitado con un lote activo, sin importar si tiene oferta -- no adjudica ni cierra nada', () => {
    renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), hasUpcomingLotes: true });

    expect(screen.getByRole('button', { name: 'Pasar al siguiente lote' })).toBeDisabled();
    expect(apiMocks.closeLoteRequest).not.toHaveBeenCalled();
    expect(apiMocks.openNextLoteRequest).not.toHaveBeenCalled();
  });

  describe('Cerrar lote (exclusivo del caso sin ninguna oferta)', () => {
    it('cierra el lote directo como desierto, sin ningún formulario', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_unsold' }));
      renderPanel({ activeLote: makeLote(), winningOffer: null, recentOffers: [] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
        outcome: 'unsold',
        final_price: undefined,
      });
      expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('desierto'));
    });

    it('muestra el aviso flotante de lote desierto tras cerrar', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_unsold' }));
      renderPanel({ activeLote: makeLote(), winningOffer: null, recentOffers: [] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Lote 1 quedó desierto');
      expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    });

    it('ante un error del backend, muestra el error como toast', async () => {
      apiMocks.closeLoteRequest.mockRejectedValue({
        isAxiosError: true,
        response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo cerrar.' } } },
      });
      renderPanel({ activeLote: makeLote(), winningOffer: null, recentOffers: [] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));

      await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se pudo cerrar.'));
      expect(screen.queryByText('Lote 1 quedó desierto')).not.toBeInTheDocument();
    });

    it('con oferta ganadora, el botón queda deshabilitado -- no se puede usar para rechazar ofertas', () => {
      renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer() });

      expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeDisabled();
    });
  });

  describe('Adjudicar lote (exclusivo del caso con oferta ganadora)', () => {
    it('sin oferta ganadora, el botón queda deshabilitado', () => {
      renderPanel({ activeLote: makeLote(), winningOffer: null });

      expect(screen.getByRole('button', { name: 'Adjudicar lote' })).toBeDisabled();
    });

    it('con oferta ganadora ya no reciente, adjudica directo (sin advertencia): cierra el lote como vendido por ese monto', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_sold' }));
      renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), recentOffers: [makeWinningOffer()] });

      await userEvent.click(screen.getByRole('button', { name: 'Adjudicar lote' }));

      expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
        outcome: 'sold',
        final_price: '1500.00',
      });
      expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('adjudicado'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ante un error del backend, muestra el error como toast', async () => {
      apiMocks.closeLoteRequest.mockRejectedValue({
        isAxiosError: true,
        response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo adjudicar.' } } },
      });
      renderPanel({ activeLote: makeLote(), winningOffer: makeWinningOffer(), recentOffers: [makeWinningOffer()] });

      await userEvent.click(screen.getByRole('button', { name: 'Adjudicar lote' }));

      await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se pudo adjudicar.'));
    });

    describe('advertencia de oferta reciente (menos de 10 segundos)', () => {
      function makeRecentOffer(secondsAgo: number) {
        return {
          id: 'oferta-1',
          buyer_id: 'buyer-1',
          amount: '1500.00',
          status: 'accepted' as const,
          created_at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
        };
      }

      it('con una oferta de hace 8 segundos, muestra el modal de advertencia en vez de adjudicar directo', async () => {
        renderPanel({
          activeLote: makeLote(),
          winningOffer: makeWinningOffer({ created_at: makeRecentOffer(8).created_at }),
          recentOffers: [makeRecentOffer(8)],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Adjudicar lote' }));

        expect(screen.getByRole('dialog')).toHaveTextContent('Última oferta hace 8 segundos');
        expect(apiMocks.closeLoteRequest).not.toHaveBeenCalled();
      });

      it('"Cancelar" en el modal de advertencia no adjudica', async () => {
        renderPanel({
          activeLote: makeLote(),
          winningOffer: makeWinningOffer({ created_at: makeRecentOffer(8).created_at }),
          recentOffers: [makeRecentOffer(8)],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Adjudicar lote' }));
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(apiMocks.closeLoteRequest).not.toHaveBeenCalled();
      });

      it('"Adjudicar igual" en el modal de advertencia sí adjudica', async () => {
        apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_sold' }));
        renderPanel({
          activeLote: makeLote(),
          winningOffer: makeWinningOffer({ created_at: makeRecentOffer(8).created_at }),
          recentOffers: [makeRecentOffer(8)],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Adjudicar lote' }));
        await userEvent.click(screen.getByRole('button', { name: 'Adjudicar igual' }));

        expect(apiMocks.closeLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', {
          outcome: 'sold',
          final_price: '1500.00',
        });
      });

      it('con una oferta ganadora de hace varios minutos, adjudica directo (sin advertencia)', async () => {
        apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_sold' }));
        renderPanel({
          activeLote: makeLote(),
          winningOffer: makeWinningOffer({ created_at: makeRecentOffer(600).created_at }),
          recentOffers: [makeRecentOffer(600)],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Adjudicar lote' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(apiMocks.closeLoteRequest).toHaveBeenCalled();
      });
    });
  });

  describe('aviso flotante de lote desierto (Módulo de lotes desiertos)', () => {
    it('el aviso es puramente informativo: solo "Continuar" -- no ofrece reincorporar desde ahí', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_unsold' }));
      renderPanel({ activeLote: makeLote(), winningOffer: null, recentOffers: [] });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Volver a rematar' })).not.toBeInTheDocument();
    });

    it('"Continuar" cierra el aviso sin llamar a requeue', async () => {
      apiMocks.closeLoteRequest.mockResolvedValue(makeLote({ status: 'closed_unsold' }));
      renderPanel({ activeLote: makeLote(), winningOffer: null, recentOffers: [] });
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar lote' }));
      await screen.findByRole('dialog');

      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(apiMocks.requeueLoteRequest).not.toHaveBeenCalled();
    });
  });
});
