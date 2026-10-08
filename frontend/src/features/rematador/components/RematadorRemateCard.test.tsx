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
    // "Programado" aparece más de una vez: la píldora de estado y la etapa en la ruta de vida.
    expect(screen.getAllByText('Programado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/3 lotes/)).toBeInTheDocument();
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
    expect(screen.getByText(/4 conectados/)).toBeInTheDocument();
  });

  it('muestra el lote que está en el martillo', () => {
    useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ activeLote: { title: 'Toro Angus' } }));
    renderCard(makeRemate({ status: 'live' }));
    expect(screen.getByText('Lote en el martillo: Toro Angus.')).toBeInTheDocument();
  });

  describe('acción principal según estado y modalidad -- un solo botón con el siguiente paso', () => {
    it('"draft" sin lotes: "Cargar lotes" lleva a /lotes', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 0 }));
      renderCard(makeRemate({ id: 'remate-9', status: 'draft' }));

      expect(screen.getByText('Cargá al menos un lote para poder publicar.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cargar lotes' }));
      expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/lotes');
    });

    it('"draft" listo (con lotes y fecha): "Publicar remate" publica desde la propia tarjeta', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 3 }));
      apiMocks.scheduleRemateRequest.mockResolvedValue(makeRemate({ status: 'scheduled' }));
      const onChanged = vi.fn();
      renderCard(makeRemate({ id: 'remate-9', status: 'draft' }), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Publicar remate' }));

      await waitFor(() => expect(apiMocks.scheduleRemateRequest).toHaveBeenCalledWith('remate-9'));
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('"scheduled" Timed: avisa que arranca solo y no ofrece iniciarlo', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(
        makeRemate({ id: 'remate-9', status: 'scheduled', auction_type: 'timed', ends_at: '2026-08-05T14:00:00Z' }),
      );

      expect(screen.getByText(/Arranca solo/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Iniciar remate' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Preparar lotes' }));
      expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/lotes');
    });

    it('"scheduled" en vivo sin rematador operador: pide generar el código (lleva a la consola)', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ id: 'remate-9', status: 'scheduled', rematador_id: null }));

      expect(screen.getByText(/odavía no tiene rematador operador/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Generar código' }));
      expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/gestionar');
    });

    it('"scheduled" en vivo con código generado: espera al martillero y abre el panel del código', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      const onOpenOperatorCode = vi.fn();
      const remate = makeRemate({
        id: 'remate-9',
        status: 'scheduled',
        rematador_id: null,
        operator_code_generated_at: new Date().toISOString(),
      });
      render(
        <MemoryRouter>
          <RematadorRemateCard remate={remate} onChanged={vi.fn()} onStarted={vi.fn()} onOpenOperatorCode={onOpenOperatorCode} />
        </MemoryRouter>,
      );

      expect(screen.getByText(/Esperando que el martillero/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Ver código' }));
      expect(onOpenOperatorCode).toHaveBeenCalledWith(remate);
    });

    it('"live"/"paused": "Administrar" / "Ver consola" llevan a /gestionar, sin botón de ciclo de vida', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      for (const [status, label] of [
        ['live', 'Administrar'],
        ['paused', 'Ver consola'],
      ] as const) {
        const { unmount } = renderCard(makeRemate({ id: 'remate-9', status }));

        await userEvent.click(screen.getByRole('button', { name: label }));
        expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9/gestionar');
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
        expect(screen.queryByRole('button', { name: 'Administrar' })).not.toBeInTheDocument();
        unmount();
      }
    });

    it('muestra la ruta de vida con la etapa actual', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'live', auction_type: 'timed', ends_at: '2099-01-01T00:00:00Z' }));

      expect(screen.getByRole('img', { name: 'Etapa: En curso' })).toBeInTheDocument();
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
      renderCard(
        makeRemate({ id: 'remate-5', status: 'draft', starts_at: '2026-09-01T10:00:00Z', title: 'Remate con fecha' }),
        onChanged,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate con fecha' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Publicar remate' }));

      await waitFor(() => expect(apiMocks.scheduleRemateRequest).toHaveBeenCalledWith('remate-5'));
      expect(toastPushMock).toHaveBeenCalledWith('success', 'El remate se publicó.');
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('"finished": Editar, Eliminar y Cancelar deshabilitados -- borrarlo dejaría "Ver resumen" sin acceso a su historial', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'finished', title: 'Remate finalizado' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate finalizado' }));

      expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Cancelar remate' })).toBeDisabled();
    });

    it('"cancelled": Eliminar habilitado -- ya es terminal, su motivo de cancelación queda en el log de auditoría aparte', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      renderCard(makeRemate({ status: 'cancelled', title: 'Remate cancelado' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate cancelado' }));

      expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeEnabled();
      expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeDisabled();
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

    it('"Eliminar" muestra un toast de error si el backend lo rechaza, sin reventar en silencio', async () => {
      apiMocks.deleteRemateRequest.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 422,
          data: { error: { code: 'business_rule_violation', message: 'No se puede eliminar.' } },
        },
      });
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo());
      const onChanged = vi.fn();
      renderCard(makeRemate({ id: 'remate-8', status: 'cancelled', title: 'Remate cancelado a eliminar' }), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate cancelado a eliminar' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

      await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se puede eliminar.'));
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe('"Iniciar remate" (remate en vivo con rematador operador asignado)', () => {
    const scheduled = (overrides: Partial<Remate> = {}) =>
      makeRemate({ status: 'scheduled', rematador_id: 'op-1', ...overrides });

    it('sin lotes queda deshabilitado, y dice por qué', () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 0 }));
      renderCard(scheduled());

      const button = screen.getByRole('button', { name: 'Iniciar remate' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Cargá al menos un lote antes de iniciar el remate.');
    });

    it('en el menú, "draft" lo deshabilita aunque ya tenga lotes -- falta publicarlo primero', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 2 }));
      renderCard(makeRemate({ status: 'draft', title: 'Remate borrador' }));

      await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Remate borrador' }));
      expect(screen.getByRole('menuitem', { name: 'Iniciar remate' })).toBeDisabled();
    });

    it('con lotes permite iniciar, y avisa a onStarted con el remate ya actualizado', async () => {
      useRemateOperationalInfoMock.mockReturnValue(defaultOperationalInfo({ loteCount: 2 }));
      const updated = makeRemate({ id: 'remate-1', status: 'live' });
      apiMocks.startRemateRequest.mockResolvedValue(updated);
      const onChanged = vi.fn();
      const onStarted = vi.fn();
      renderCard(scheduled({ id: 'remate-1' }), onChanged, onStarted);

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
      renderCard(scheduled(), onChanged);

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar remate' }));

      await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se puede iniciar.'));
      expect(onChanged).not.toHaveBeenCalled();
    });
  });
});
