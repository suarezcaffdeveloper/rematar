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
  navigateMock,
  apiMocks,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useRematesMock: vi.fn(),
  useRemateOperationalInfoMock: vi.fn(),
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
vi.mock('../../remates/hooks', () => ({ useRemates: useRematesMock }));
vi.mock('../hooks', () => ({
  useRemateOperationalInfo: useRemateOperationalInfoMock,
}));
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
    category: 'otros',
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
  });

  it('pasa el owner_id del usuario autenticado a useRemates', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });
    useRemateOperationalInfoMock.mockReturnValue({
      loteCount: 0,
      activeLote: null,
      nextLote: null,
      connectedUsers: null,
      isLoadingLotes: false,
    });

    renderPage();

    expect(useRematesMock).toHaveBeenCalledWith({ ownerId: 'user-42' });
  });

  it('mientras carga, muestra esqueletos (sin stats ni tarjetas)', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ver remate')).not.toBeInTheDocument();
  });

  it('ante un error, lo muestra con botón de reintentar', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
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

  it('sin remates propios, muestra el estado vacío', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Todavía no tenés remates')).toBeInTheDocument();
  });

  it('con remates propios, muestra las stats y una tarjeta por cada uno (sin tabla)', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRemateOperationalInfoMock.mockReturnValue({
      loteCount: 3,
      activeLote: null,
      nextLote: null,
      connectedUsers: null,
      isLoadingLotes: false,
    });
    useRematesMock.mockReturnValue({
      remates: [
        makeRemate({ id: 'a', title: 'Remate A', status: 'live' }),
        makeRemate({ id: 'b', title: 'Remate B', status: 'scheduled' }),
      ],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Remate A')).toBeInTheDocument();
    expect(screen.getByText('Remate B')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Fila de estadísticas -- al menos el total de remates propios.
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('el filtro de estado incluye "Borrador" (a diferencia del dashboard del comprador)', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRemateOperationalInfoMock.mockReturnValue({
      loteCount: 0,
      activeLote: null,
      nextLote: null,
      connectedUsers: null,
      isLoadingLotes: false,
    });
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'a', status: 'draft' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    const statusSelect = screen.getByLabelText('Filtrar por estado');
    expect(within(statusSelect).getByText('Borrador')).toBeInTheDocument();
  });

  it('"Crear remate" abre el modal de creación', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: 'Crear remate' })[0]);
    expect(screen.getByRole('heading', { name: 'Crear nuevo remate' })).toBeInTheDocument();
  });

  it('al crear un remate, muestra la transición de éxito y luego navega a su página de lotes', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    const reload = vi.fn();
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload });
    apiMocks.createRemateRequest.mockResolvedValue({ id: 'remate-nuevo' });

    renderPage();

    // Sin remates, "Crear remate" aparece dos veces (header + estado vacío) -- se abre
    // desde el del header.
    await userEvent.click(screen.getAllByRole('button', { name: 'Crear remate' })[0]);
    await userEvent.type(screen.getByLabelText('Título'), 'Mi primer remate');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear remate' }));

    expect(await screen.findByText('Remate creado correctamente')).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/remates/remate-nuevo/lotes'), { timeout: 2000 });
  });

  it('al iniciar un remate, el cartel de redirección sobrevive a que la lista quede en isLoading (reload) y termina navegando a la Consola Operativa', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRemateOperationalInfoMock.mockReturnValue({
      loteCount: 2,
      activeLote: null,
      nextLote: null,
      connectedUsers: null,
      isLoadingLotes: false,
    });

    const remate = makeRemate({ id: 'remate-1', status: 'scheduled' });
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
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRemateOperationalInfoMock.mockReturnValue({
      loteCount: 1,
      activeLote: null,
      nextLote: null,
      connectedUsers: null,
      isLoadingLotes: false,
    });
    const remateA = makeRemate({ id: 'remate-a', title: 'Remate A' });
    const remateB = makeRemate({ id: 'remate-b', title: 'Remate B' });
    useRematesMock.mockReturnValue({ remates: [remateA, remateB], isLoading: false, error: null, reload: vi.fn() });

    renderPage([{ pathname: '/', state: { highlightRemateId: 'remate-b' } }]);

    const cardB = screen.getByText('Remate B').closest('article');
    expect(cardB).not.toBeNull();
    expect(within(cardB as HTMLElement).getByRole('status', { name: 'Remate publicado' })).toBeInTheDocument();

    const cardA = screen.getByText('Remate A').closest('article');
    expect(within(cardA as HTMLElement).queryByRole('status', { name: 'Remate publicado' })).not.toBeInTheDocument();

    // Se consume una sola vez -- limpia el state de la navegación para que un refresh o
    // volver con "atrás" no repita el resalte.
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true, state: null });
  });

  it('no muestra la fila de "lotes abiertos"/"conectados" (sacada del rediseño visual)', () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-42', role: 'rematador' } });
    useRemateOperationalInfoMock.mockReturnValue({
      loteCount: 0,
      activeLote: null,
      nextLote: null,
      connectedUsers: null,
      isLoadingLotes: false,
    });
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
