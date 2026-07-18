import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RematadorRemateCard } from './RematadorRemateCard';
import type { Remate } from '../../remates/types';

const { navigateMock, useRemateOperationalInfoMock, apiMocks, toastPushMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useRemateOperationalInfoMock: vi.fn(),
  apiMocks: {
    startRemateRequest: vi.fn(),
    resumeRemateRequest: vi.fn(),
    finishRemateRequest: vi.fn(),
  },
  toastPushMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../hooks', () => ({ useRemateOperationalInfo: useRemateOperationalInfoMock }));
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
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: null,
    status: 'scheduled',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function defaultOperationalInfo(overrides = {}) {
  return {
    loteCount: 3,
    activeLote: null,
    nextLote: null,
    connectedUsers: null,
    isLoadingLotes: false,
    ...overrides,
  };
}

function renderCard(remate: Remate, onChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <RematadorRemateCard remate={remate} onChanged={onChanged} />
    </MemoryRouter>,
  );
}

describe('RematadorRemateCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra título, estado, fecha y cantidad de lotes', () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
    renderCard(makeRemate());

    expect(screen.getByText('Remate de hacienda')).toBeInTheDocument();
    expect(screen.getByText('Programado')).toBeInTheDocument();
    expect(screen.getByText('3 lotes')).toBeInTheDocument();
  });

  it('muestra "conectados" solo cuando el dato está disponible', () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ connectedUsers: null }));
    const { rerender } = renderCard(makeRemate({ status: 'scheduled' }));
    expect(screen.queryByText(/conectados|conectado/)).not.toBeInTheDocument();

    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ connectedUsers: 4 }));
    rerender(
      <MemoryRouter>
        <RematadorRemateCard remate={makeRemate({ status: 'live' })} onChanged={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('4 conectados')).toBeInTheDocument();
  });

  it('muestra el lote activo o el próximo lote', () => {
    useRemateOperationalInfoMock.mockReturnValue(
      defaultOperationalInfo({ activeLote: { title: 'Toro Angus' } }),
    );
    renderCard(makeRemate({ status: 'live' }));
    expect(screen.getByText('Lote activo: Toro Angus')).toBeInTheDocument();
  });

  it('"Ver remate" y "Administrar" navegan a las rutas correspondientes', async () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
    renderCard(makeRemate({ id: 'remate-9' }));

    await userEvent.click(screen.getByRole('button', { name: 'Ver remate' }));
    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9');

    await userEvent.click(screen.getByRole('button', { name: 'Administrar' }));
    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/gestionar');
  });

  describe('acciones de ciclo de vida', () => {
    it('"scheduled" muestra "Iniciar remate", deshabilitado sin lotes', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 0 }));
      renderCard(makeRemate({ status: 'scheduled' }));

      const button = screen.getByRole('button', { name: 'Iniciar remate' });
      expect(button).toBeDisabled();
    });

    it('"scheduled" con lotes permite iniciar, y llama al endpoint + toast + onChanged', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 2 }));
      apiMocks.startRemateRequest.mockResolvedValue(makeRemate({ status: 'live' }));
      const onChanged = vi.fn();
      renderCard(makeRemate({ id: 'remate-1', status: 'scheduled' }), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar remate' }));

      await waitFor(() => expect(apiMocks.startRemateRequest).toHaveBeenCalledWith('remate-1'));
      expect(toastPushMock).toHaveBeenCalledWith('success', 'El remate está en vivo.');
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('"paused" muestra "Reanudar remate"', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'paused' }));
      expect(screen.getByRole('button', { name: 'Reanudar remate' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Iniciar remate' })).not.toBeInTheDocument();
    });

    it('"live" sin lote abierto permite finalizar; con lote abierto lo deshabilita', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ activeLote: null }));
      const { rerender } = renderCard(makeRemate({ status: 'live' }));
      expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeEnabled();

      useRemateOperationalInfoMock.mockReturnValue(
        defaultOperationalInfo({ activeLote: { title: 'Lote en curso' } }),
      );
      rerender(
        <MemoryRouter>
          <RematadorRemateCard remate={makeRemate({ status: 'live' })} onChanged={vi.fn()} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('button', { name: 'Finalizar remate' })).toBeDisabled();
    });

    it('"Finalizar remate" pide confirmación antes de llamar al endpoint', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ activeLote: null }));
      apiMocks.finishRemateRequest.mockResolvedValue(makeRemate({ status: 'finished' }));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderCard(makeRemate({ status: 'live' }));

      await userEvent.click(screen.getByRole('button', { name: 'Finalizar remate' }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(apiMocks.finishRemateRequest).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('draft/finished/cancelled no muestran ningún botón de ciclo de vida', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      for (const status of ['draft', 'finished', 'cancelled'] as const) {
        const { unmount } = renderCard(makeRemate({ status }));
        expect(screen.queryByRole('button', { name: /Iniciar|Reanudar|Finalizar/ })).not.toBeInTheDocument();
        unmount();
      }
    });

    it('ante un error del backend, muestra el mensaje normalizado como toast y no llama a onChanged', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 2 }));
      apiMocks.startRemateRequest.mockRejectedValue({
        isAxiosError: true,
        response: { status: 422, data: { error: { code: 'business_rule', message: 'No se puede iniciar.' } } },
      });
      const onChanged = vi.fn();
      renderCard(makeRemate({ status: 'scheduled' }), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar remate' }));

      await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se puede iniciar.'));
      expect(onChanged).not.toHaveBeenCalled();
    });
  });
});
