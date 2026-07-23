import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    pauseLoteTimerRequest: vi.fn(),
    resumeLoteTimerRequest: vi.fn(),
    resetLoteTimerRequest: vi.fn(),
    setLoteTimerRemainingRequest: vi.fn(),
    setLoteTimerAutoCloseRequest: vi.fn(),
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

  it('con un lote activo, "Abrir"/"Pasar siguiente"/"Finalizar" se deshabilitan y "Cerrar lote" se habilita', () => {
    renderPanel({ activeLote: makeLote(), selectedLoteId: 'lote-9', hasUpcomingLotes: true });

    expect(screen.getByRole('button', { name: 'Abrir lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pasar al siguiente lote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeEnabled();
  });

  it('remate "paused": "Reanudar" habilitado, "Pausar"/"Abrir"/"Finalizar" deshabilitados, "Cerrar lote" sigue disponible', () => {
    renderPanel({ remate: makeRemate({ status: 'paused' }), activeLote: makeLote() });

    expect(screen.getByRole('button', { name: 'Reanudar remate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pausar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar lote' })).toBeEnabled();
  });

  it('clic en "Pausar remate" llama al endpoint y muestra un toast de éxito', async () => {
    apiMocks.pauseRemateRequest.mockResolvedValue(makeRemate({ status: 'paused' }));
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Pausar remate' }));

    expect(apiMocks.pauseRemateRequest).toHaveBeenCalledWith('remate-1');
    expect(toastPushMock).toHaveBeenCalledWith('success', 'El remate se pausó.');
  });

  it('"Finalizar remate" pide confirmación -- si se cancela, no llama al endpoint', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Finalizar remate' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(apiMocks.finishRemateRequest).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
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

  describe('cuenta regresiva del lote', () => {
    it('sin timer configurado (ambos campos null), no muestra la sección', () => {
      renderPanel({ activeLote: makeLote() });
      expect(screen.queryByText('Cuenta regresiva del lote')).not.toBeInTheDocument();
    });

    it('con timer corriendo, "Pausar" habilitado y "Reanudar" deshabilitado', () => {
      renderPanel({ activeLote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) });

      expect(screen.getByRole('button', { name: 'Pausar timer' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Reanudar timer' })).toBeDisabled();
    });

    it('con timer pausado, "Reanudar" habilitado y "Pausar" deshabilitado', () => {
      renderPanel({ activeLote: makeLote({ timer_ends_at: null, timer_paused_remaining_seconds: 20 }) });

      expect(screen.getByRole('button', { name: 'Pausar timer' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Reanudar timer' })).toBeEnabled();
    });

    it('al pausar, llama a pauseLoteTimerRequest y confirma con un toast', async () => {
      apiMocks.pauseLoteTimerRequest.mockResolvedValue(makeLote());
      renderPanel({ activeLote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) });

      await userEvent.click(screen.getByRole('button', { name: 'Pausar timer' }));

      expect(apiMocks.pauseLoteTimerRequest).toHaveBeenCalledWith('remate-1', 'lote-1');
      expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('pausó'));
    });

    it('al reiniciar, llama a resetLoteTimerRequest', async () => {
      apiMocks.resetLoteTimerRequest.mockResolvedValue(makeLote());
      renderPanel({ activeLote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) });

      await userEvent.click(screen.getByRole('button', { name: 'Reiniciar timer' }));

      expect(apiMocks.resetLoteTimerRequest).toHaveBeenCalledWith('remate-1', 'lote-1');
    });

    it('el botón de cierre automático alterna según el estado actual y llama con el valor opuesto', async () => {
      apiMocks.setLoteTimerAutoCloseRequest.mockResolvedValue(makeLote());
      renderPanel({
        activeLote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z', timer_auto_close_enabled: true }),
      });

      const button = screen.getByRole('button', { name: 'Desactivar cierre automático' });
      await userEvent.click(button);

      expect(apiMocks.setLoteTimerAutoCloseRequest).toHaveBeenCalledWith('remate-1', 'lote-1', false);
    });

    it('fijar tiempo restante: deshabilitado con el campo vacío, habilitado con un número válido', async () => {
      apiMocks.setLoteTimerRemainingRequest.mockResolvedValue(makeLote());
      renderPanel({ activeLote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) });

      const submitButton = screen.getByRole('button', { name: 'Fijar tiempo restante' });
      expect(submitButton).toBeDisabled();

      await userEvent.type(screen.getByLabelText('Tiempo restante (segundos)'), '45');
      expect(submitButton).toBeEnabled();

      await userEvent.click(submitButton);
      expect(apiMocks.setLoteTimerRemainingRequest).toHaveBeenCalledWith('remate-1', 'lote-1', 45);
    });
  });
});
