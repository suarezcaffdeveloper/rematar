import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RematadorDashboardPage } from './RematadorDashboardPage';
import type { Remate } from '../../remates/types';

const {
  useAuthMock,
  useRematesMock,
  useRemateOperationalInfoMock,
  useFinishedRematesMock,
  useVentasAdjudicadasMock,
  navigateMock,
  apiMocks,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useRematesMock: vi.fn(),
  useRemateOperationalInfoMock: vi.fn(),
  useFinishedRematesMock: vi.fn(),
  useVentasAdjudicadasMock: vi.fn(),
  navigateMock: vi.fn(),
  apiMocks: {
    createRemateRequest: vi.fn(),
    updateRemateRequest: vi.fn(),
    startRemateRequest: vi.fn(),
    resumeRemateRequest: vi.fn(),
    finishRemateRequest: vi.fn(),
    scheduleRemateRequest: vi.fn(),
    deleteRemateRequest: vi.fn(),
    cancelRemateRequest: vi.fn(),
    createLoteRequest: vi.fn(),
    fetchLotesRequest: vi.fn(),
  },
}));

vi.mock('../../auth/hooks', () => ({ useAuth: useAuthMock }));
vi.mock('../../remates/hooks', () => ({
  useRemates: useRematesMock,
  // La galería "En curso" y las portadas piden estos dos -- sin datos alcanza para estos tests.
  useRemateLiveSnapshot: () => null,
  useLoteCount: () => null,
  useLoteCoverImages: () => [],
}));
vi.mock('../hooks', () => ({
  useRemateOperationalInfo: useRemateOperationalInfoMock,
}));
vi.mock('../../history/hooks', () => ({ useFinishedRemates: useFinishedRematesMock }));
vi.mock('../../postauction/hooks', () => ({ useVentasAdjudicadas: useVentasAdjudicadasMock }));
vi.mock('../../remates/api', () => apiMocks);
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeRemate(overrides: Partial<Remate>): Remate {
  return {
    id: 'id-1',
    owner_id: 'owner-1',
    title: 'Remate genérico',
    description: null,
    category: 'mercaderia_e_indumentaria',
    cover_image_url: null,
    location: null,
    starts_at: '2026-08-01T10:00:00Z',
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

function operationalInfo(overrides = {}) {
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

function renderPage(initialEntries: Array<string | { pathname: string; state?: unknown }> = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <RematadorDashboardPage />
    </MemoryRouter>,
  );
}

describe('RematadorDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'empresa', full_name: 'Mariana Ferrero' } });
    useRemateOperationalInfoMock.mockReturnValue(operationalInfo());
    useFinishedRematesMock.mockReturnValue({ data: null });
    useVentasAdjudicadasMock.mockReturnValue({ data: null });
  });

  it('pasa el owner_id del usuario autenticado a useRemates', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });

    renderPage();

    expect(useRematesMock).toHaveBeenCalledWith({ ownerId: 'user-42' });
  });

  it('mientras carga, muestra esqueletos (sin secciones de contenido ni tarjetas)', () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Qué hacer ahora' })).not.toBeInTheDocument();
  });

  it('ante un error, lo muestra con botón de reintentar', async () => {
    const reload = vi.fn();
    useRematesMock.mockReturnValue({
      remates: [],
      isLoading: false,
      error: { status: null, code: 'network_error', message: 'No se pudo conectar con el servidor.' },
      reload,
    });

    renderPage();
    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sin remates propios, muestra el estado vacío y un titular que invita a crear el primero', () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Todavía no creaste ningún remate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Armá tu primer remate.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Qué hacer ahora' })).not.toBeInTheDocument();
  });

  it('con remates propios, muestra el titular, "Qué hacer ahora" y una tarjeta por cada uno (sin tabla)', () => {
    useRematesMock.mockReturnValue({
      remates: [
        makeRemate({ id: 'a', title: 'Remate A', status: 'live' }),
        makeRemate({ id: 'b', title: 'Remate B', status: 'paused' }),
      ],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tenés 2 remates en curso');
    expect(screen.getByRole('heading', { name: 'Qué hacer ahora' })).toBeInTheDocument();
    // Un remate pausado es una tarea de atención.
    expect(screen.getByText('“Remate B” está pausado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En curso' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tus remates' })).toBeInTheDocument();
    // Cada remate tiene su tarjeta (la galería "En curso" repite el título de los que corren).
    expect(screen.getAllByRole('heading', { name: 'Remate A' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('heading', { name: 'Remate B' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('los filtros por etapa incluyen "Borradores" con su cantidad', () => {
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'a', status: 'draft' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    const filters = screen.getByRole('group', { name: 'Filtrar por etapa' });
    expect(within(filters).getByRole('button', { name: /Borradores/ })).toHaveTextContent('1');
    expect(within(filters).getByRole('button', { name: /Finalizados/ })).toBeInTheDocument();
  });

  it('filtrar por una etapa deja solo los remates de esa etapa', async () => {
    useRematesMock.mockReturnValue({
      remates: [
        makeRemate({ id: 'a', title: 'Remate programado', status: 'scheduled' }),
        makeRemate({ id: 'b', title: 'Remate cerrado', status: 'finished' }),
      ],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    await userEvent.click(within(screen.getByRole('group', { name: 'Filtrar por etapa' })).getByRole('button', { name: /Finalizados/ }));

    expect(screen.queryByRole('heading', { name: 'Remate programado' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remate cerrado' })).toBeInTheDocument();
  });

  it('"Crear remate" abre el asistente en el primer paso', async () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: 'Crear remate' })[0]);
    expect(screen.getByRole('heading', { name: '¿Cómo querés que sea el remate?' })).toBeInTheDocument();
  });

  it('al crear un remate con el asistente, muestra la transición de éxito y luego navega a su página de lotes', async () => {
    const reload = vi.fn();
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload });
    apiMocks.createRemateRequest.mockResolvedValue({ id: 'remate-nuevo' });

    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: 'Crear remate' })[0]);
    const dialog = screen.getByRole('dialog');

    // Paso 1: modalidad. Paso 2: datos.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await userEvent.type(within(dialog).getByLabelText(/Título/), 'Mi primer remate');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Categoría/), 'hacienda');
    // Pasos 3 (fechas) y 4 (garantía) no tienen nada obligatorio en un remate en vivo.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    // Paso 5: revisar y crear.
    expect(within(dialog).getByText('Qué sigue después de crearlo')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear remate' }));

    expect(await screen.findByText('Remate creado correctamente')).toBeInTheDocument();
    expect(apiMocks.createRemateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mi primer remate', category: 'hacienda', auction_type: 'live', access_type: 'public' }),
    );
    expect(reload).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/remates/remate-nuevo/lotes'), { timeout: 2000 });
  });

  it('el asistente no deja avanzar del paso de datos sin título ni categoría', async () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: 'Crear remate' })[0]);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));

    expect(within(dialog).getByRole('heading', { name: 'Contá de qué se trata' })).toBeInTheDocument();
    expect(within(dialog).getByText('El título debe tener entre 3 y 200 caracteres.')).toBeInTheDocument();
    expect(within(dialog).getByText('Elegí una categoría.')).toBeInTheDocument();
  });

  it('al iniciar un remate, el cartel de redirección sobrevive a que la lista quede en isLoading (reload) y termina navegando a la Consola Operativa', async () => {
    useRemateOperationalInfoMock.mockReturnValue(operationalInfo({ loteCount: 2 }));

    // Con rematador operador asignado, "Iniciar remate" es la acción principal de la tarjeta.
    const remate = makeRemate({ id: 'remate-1', status: 'scheduled', rematador_id: 'op-1' });
    apiMocks.startRemateRequest.mockResolvedValue({ ...remate, status: 'live' });

    let isLoading = false;
    const reload = vi.fn(() => {
      // Simula lo que hacía `useAsyncResource` de verdad: `reload()` pone `isLoading` en
      // true de inmediato, reemplazando las tarjetas por esqueletos mientras se
      // refetchea la lista. Antes de este fix, el cartel/timer vivía dentro de la
      // tarjeta y se desmontaba junto con ella acá -- nunca llegaba a redirigir.
      isLoading = true;
    });
    useRematesMock.mockImplementation(() => ({ remates: [remate], isLoading, error: null, reload }));

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar remate' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Iniciar remate' })).not.toBeInTheDocument();
    expect(await screen.findByText('¡Remate en vivo!')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/remates/remate-1/gestionar');

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/remates/remate-1/gestionar'), {
      timeout: 3000,
    });
  });

  it('al volver de publicar un remate, resalta esa tarjeta un momento y no repite el resalte si se vuelve a renderizar', async () => {
    useRemateOperationalInfoMock.mockReturnValue(operationalInfo({ loteCount: 1 }));
    const remateA = makeRemate({ id: 'remate-a', title: 'Remate A', rematador_id: 'op-1' });
    const remateB = makeRemate({ id: 'remate-b', title: 'Remate B', rematador_id: 'op-1' });
    useRematesMock.mockReturnValue({ remates: [remateA, remateB], isLoading: false, error: null, reload: vi.fn() });

    renderPage([{ pathname: '/', state: { highlightRemateId: 'remate-b' } }]);

    const cardB = screen.getByRole('heading', { name: 'Remate B' }).closest('article');
    expect(cardB).not.toBeNull();
    expect(within(cardB as HTMLElement).getByRole('status', { name: 'Remate publicado' })).toBeInTheDocument();

    const cardA = screen.getByRole('heading', { name: 'Remate A' }).closest('article');
    expect(within(cardA as HTMLElement).queryByRole('status', { name: 'Remate publicado' })).not.toBeInTheDocument();

    // Se consume una sola vez -- limpia el state de la navegación para que un refresh o
    // volver con "atrás" no repita el resalte.
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true, state: null });
  });

  it('muestra los números del último mes solo si hubo remates cerrados en el período', () => {
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'f1', title: 'Cerrado', status: 'finished' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useFinishedRematesMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'f1',
            status: 'finished',
            resolved_at: recent,
            lote_count: 10,
            lotes_sold_count: 8,
            total_awarded_value: '5000000.00',
          },
        ],
      },
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Tus últimos 30 días' })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('8 de 10 lotes')).toBeInTheDocument();
  });

  it('sin remates cerrados en el último mes, no muestra la sección de números', () => {
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'a', status: 'scheduled' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.queryByRole('heading', { name: 'Tus últimos 30 días' })).not.toBeInTheDocument();
  });

  it('no muestra la fila de "lotes abiertos"/"conectados" (sacada del rediseño visual)', () => {
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'a', status: 'live' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.queryByText('Lotes abiertos')).not.toBeInTheDocument();
    expect(screen.queryByText('Compradores conectados')).not.toBeInTheDocument();
  });
});
