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
    scheduleRemateRequest: vi.fn(),
    deleteRemateRequest: vi.fn(),
    cancelRemateRequest: vi.fn(),
    createRemateRequest: vi.fn(),
    updateRemateRequest: vi.fn(),
    createLoteRequest: vi.fn(),
    fetchLotesRequest: vi.fn(),
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
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
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
    coverImages: [],
    isLoadingLotes: false,
    ...overrides,
  };
}

function renderCard(remate: Remate, onChanged = vi.fn(), onStarted = vi.fn()) {
  return render(
    <MemoryRouter>
      <RematadorRemateCard remate={remate} onChanged={onChanged} onStarted={onStarted} />
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

  it('sin cover_image_url pero con coverImages, arma un collage con ellas', () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ coverImages: ['a.jpg', 'b.jpg'] }));
    const { container } = renderCard(makeRemate());

    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(Array.from(imgs).map((img) => img.getAttribute('src'))).toEqual(['a.jpg', 'b.jpg']);
  });

  it('isHighlighted muestra el brillo de "recién publicado"; por default, no', () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
    const { rerender } = renderCard(makeRemate());
    expect(screen.queryByRole('status', { name: 'Remate publicado' })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <RematadorRemateCard remate={makeRemate()} onChanged={vi.fn()} onStarted={vi.fn()} isHighlighted />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status', { name: 'Remate publicado' })).toBeInTheDocument();
  });

  it('muestra "conectados" solo cuando el dato está disponible', () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ connectedUsers: null }));
    const { rerender } = renderCard(makeRemate({ status: 'scheduled' }));
    expect(screen.queryByText(/conectados|conectado/)).not.toBeInTheDocument();

    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ connectedUsers: 4 }));
    rerender(
      <MemoryRouter>
        <RematadorRemateCard remate={makeRemate({ status: 'live' })} onChanged={vi.fn()} onStarted={vi.fn()} />
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

  describe('botones según estado -- dos para "preparando"/"en vivo", uno solo para "finalizado"', () => {
    it('"draft"/"scheduled": "Preparar lotes" (a /lotes) e "Iniciar remate", sin "Administrar"/"Ver detalle"/"Ver historial"', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      for (const status of ['draft', 'scheduled'] as const) {
        const { unmount } = renderCard(makeRemate({ id: 'remate-9', status }));

        await userEvent.click(screen.getByRole('button', { name: 'Preparar lotes' }));
        expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/lotes');
        expect(screen.getByRole('button', { name: 'Iniciar remate' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Administrar' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ver detalle' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ver historial' })).not.toBeInTheDocument();
        unmount();
      }
    });

    it('"live"/"paused": "Administrar" (a /gestionar) y "Ver detalle" (a la ficha), sin botón de ciclo de vida', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      for (const status of ['live', 'paused'] as const) {
        const { unmount } = renderCard(makeRemate({ id: 'remate-9', status }));

        await userEvent.click(screen.getByRole('button', { name: 'Administrar' }));
        expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/gestionar');

        await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
        expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9');

        expect(screen.queryByRole('button', { name: /Iniciar|Reanudar|Finalizar/ })).not.toBeInTheDocument();
        unmount();
      }
    });

    it('"finished"/"cancelled": un único botón "Ver resumen" (a /historial)', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      for (const status of ['finished', 'cancelled'] as const) {
        const { unmount } = renderCard(makeRemate({ id: 'remate-9', status }));

        await userEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
        expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/historial');

        expect(screen.queryByRole('button', { name: 'Ver historial' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ver resultados' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Administrar' })).not.toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('menú de acciones', () => {
    it('"draft": Editar y Eliminar habilitados, Publicar deshabilitado sin fecha', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'draft', starts_at: null, title: 'Remate borrador' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate borrador' }));

      expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeEnabled();
      expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeEnabled();
      expect(screen.getByRole('menuitem', { name: 'Publicar remate' })).toBeDisabled();
    });

    it('"draft" con fecha: Publicar habilitado y llama a scheduleRemateRequest', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      apiMocks.scheduleRemateRequest.mockResolvedValue(makeRemate({ status: 'scheduled' }));
      const onChanged = vi.fn();
      renderCard(makeRemate({ id: 'remate-5', status: 'draft', starts_at: '2026-09-01T10:00:00Z', title: 'Remate con fecha' }), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate con fecha' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Publicar remate' }));

      await waitFor(() => expect(apiMocks.scheduleRemateRequest).toHaveBeenCalledWith('remate-5'));
      expect(toastPushMock).toHaveBeenCalledWith('success', 'El remate se publicó.');
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('"live"/"finished": Editar y Eliminar deshabilitados', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'finished', title: 'Remate finalizado' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate finalizado' }));

      expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Cancelar remate' })).toBeDisabled();
    });

    it('"Duplicar" crea una copia y navega a su página de lotes', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      apiMocks.createRemateRequest.mockResolvedValue(makeRemate({ id: 'remate-copia' }));
      apiMocks.fetchLotesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 300 });
      renderCard(makeRemate({ title: 'Remate original' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate original' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));

      await waitFor(() => expect(apiMocks.createRemateRequest).toHaveBeenCalledTimes(1));
      expect(navigateMock).toHaveBeenCalledWith('/remates/remate-copia/lotes');
    });

    it('"Editar" abre el modal de edición', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'draft', title: 'Remate a editar' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate a editar' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

      expect(screen.getByRole('heading', { name: 'Editar remate' })).toBeInTheDocument();
    });

    it('"Eliminar" pide confirmación y llama a deleteRemateRequest', async () => {
      apiMocks.deleteRemateRequest.mockResolvedValue(undefined);
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      const onChanged = vi.fn();
      renderCard(makeRemate({ id: 'remate-7', status: 'draft', title: 'Remate a eliminar' }), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate a eliminar' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
      // El menú ya se cerró (DropdownMenu cierra al elegir un ítem) -- el único botón
      // "Eliminar" que queda es el de confirmación del modal.
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

      await waitFor(() => expect(apiMocks.deleteRemateRequest).toHaveBeenCalledWith('remate-7'));
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('"Iniciar remate"', () => {
    it('"scheduled" sin lotes lo deshabilita', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 0 }));
      renderCard(makeRemate({ status: 'scheduled' }));

      const button = screen.getByRole('button', { name: 'Iniciar remate' });
      expect(button).toBeDisabled();
    });

    it('"draft" lo deshabilita aunque ya tenga lotes -- falta publicarlo primero', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 2 }));
      renderCard(makeRemate({ status: 'draft' }));

      expect(screen.getByRole('button', { name: 'Iniciar remate' })).toBeDisabled();
    });

    it('"scheduled" con lotes permite iniciar, y avisa a onStarted con el remate ya actualizado', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 2 }));
      const updated = makeRemate({ id: 'remate-1', status: 'live' });
      apiMocks.startRemateRequest.mockResolvedValue(updated);
      const onChanged = vi.fn();
      const onStarted = vi.fn();
      renderCard(makeRemate({ id: 'remate-1', status: 'scheduled' }), onChanged, onStarted);

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar remate' }));

      await waitFor(() => expect(apiMocks.startRemateRequest).toHaveBeenCalledWith('remate-1'));
      expect(onChanged).toHaveBeenCalledTimes(1);
      // El cartel de redirección y la navegación viven en `RematadorDashboardPage`, no
      // acá -- esta tarjeta solo avisa que arrancó, con el remate ya actualizado
      // (ver el test de esa página para el flujo completo, incluida la redirección).
      expect(onStarted).toHaveBeenCalledWith(updated);
      expect(toastPushMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
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
