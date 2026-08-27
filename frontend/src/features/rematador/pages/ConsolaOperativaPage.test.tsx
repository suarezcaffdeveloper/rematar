import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useBreadcrumbStore } from '../../../app/layouts/breadcrumbStore';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { ConsolaOperativaPage } from './ConsolaOperativaPage';
import type { Lote, Remate } from '../../remates/types';
import type { UseLiveRemateStateResult } from '../../sala/hooks';
import type { RemateStateSnapshot } from '../../sala/types';

const { navigateMock, useLiveRemateStateMock, useAuthMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLiveRemateStateMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ remateId: 'remate-1' }),
  };
});

vi.mock('../../sala/hooks', () => ({ useLiveRemateState: useLiveRemateStateMock }));
vi.mock('../../auth/hooks', () => ({ useAuth: useAuthMock }));

// Paneles exclusivos del dueño (empresa) -- antes de este archivo nunca se ejercitaban
// (ningún test mockeaba `useAuth` con un `user.id` igual al `owner_id` del remate), así
// que no tienen fetch/websocket propios que mockear acá. Se reemplazan por un stub
// liviano: lo que interesa en este archivo es la composición de `ConsolaOperativaPage`
// (qué se muestra u oculta según el rol), no el contenido interno de estos paneles, que
// ya tiene su propia cobertura (`AnalyticsPanel.test.tsx`, etc.).
vi.mock('../../analytics/components/AnalyticsPanel', () => ({
  AnalyticsPanel: () => <div>Analítica en tiempo real (mock)</div>,
}));
vi.mock('../../bots/components/ConsolaBotsPanel', () => ({
  ConsolaBotsPanel: () => <div>Simuladores (mock)</div>,
}));
vi.mock('../components/OperatorCodePanel', () => ({
  OperatorCodePanel: () => <div>Código de operador (mock)</div>,
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

function makeSnapshot(overrides: Partial<RemateStateSnapshot> = {}): RemateStateSnapshot {
  return {
    schema_version: 1,
    remate: makeRemate(),
    active_lote: makeLote(),
    winning_offer: null,
    recent_offers: [],
    connected_users: 4,
    connected_users_detail: null,
    generated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function mockLiveState(overrides: Partial<UseLiveRemateStateResult> = {}) {
  useLiveRemateStateMock.mockReturnValue({ ...defaultLiveState(), ...overrides });
}

function defaultLiveState(): UseLiveRemateStateResult {
  return {
    snapshot: makeSnapshot(),
    isLoading: false,
    error: null,
    reload: vi.fn(),
    upcomingLotes: [],
    isUpcomingLotesLoading: false,
    desiertoLotes: [],
    connectionStatus: 'open',
    subscribeToRealtime: () => () => {},
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConsolaOperativaPage />
    </MemoryRouter>,
  );
}

describe('ConsolaOperativaPage', () => {
  beforeEach(() => {
    // Viewer sin sesión "propietaria" del remate por default (mismo comportamiento que
    // tenían estos tests antes de mockear `useAuth`, con el store real sin usuario
    // logueado) -- el rematador operador es el caso por defecto de casi todos los tests
    // de este archivo; el caso "empresa dueña" se mockea aparte, más abajo.
    useAuthMock.mockReturnValue({ user: undefined });
  });

  it('mientras carga, muestra esqueletos', () => {
    mockLiveState({ snapshot: null, isLoading: true });
    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('si el snapshot falla, muestra el error con reintentar y volver al dashboard', async () => {
    const reload = vi.fn();
    mockLiveState({ snapshot: null, error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' }, reload });

    renderPage();
    expect(screen.getByText('Remate no encontrado.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('remate "scheduled": muestra la cabecera pero no los paneles operativos', () => {
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ status: 'scheduled' }), active_lote: null }) });

    renderPage();

    expect(screen.getByText('Programado')).toBeInTheDocument();
    expect(screen.getByText('Esta consola es para remates en vivo')).toBeInTheDocument();
    expect(screen.getByText(/Iniciálo desde el dashboard/)).toBeInTheDocument();
    expect(screen.queryByText('Panel de control')).not.toBeInTheDocument();
  });

  it('remate "finished": mensaje específico, con acceso al resumen, sin paneles', () => {
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ status: 'finished' }), active_lote: null }) });
    renderPage();
    expect(screen.getByText('El remate finalizó correctamente')).toBeInTheDocument();
    expect(screen.getByText('Ver resumen')).toBeInTheDocument();
  });

  it('remate "scheduled", viewer dueño: ya muestra "Datos para el martillero" aunque todavía no esté en vivo', () => {
    useAuthMock.mockReturnValue({ user: { id: 'owner-1', role: 'empresa' } });
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ status: 'scheduled' }), active_lote: null }) });

    renderPage();

    expect(screen.getByText('Código de operador (mock)')).toBeInTheDocument(); // OperatorCodePanel
    expect(screen.getByText('Esta consola es para remates en vivo')).toBeInTheDocument();
  });

  it('remate "finished", viewer dueño: ya no muestra "Datos para el martillero"', () => {
    useAuthMock.mockReturnValue({ user: { id: 'owner-1', role: 'empresa' } });
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ status: 'finished' }), active_lote: null }) });

    renderPage();

    expect(screen.queryByText('Código de operador (mock)')).not.toBeInTheDocument();
  });

  it('remate "live", con lote activo: muestra el lote, el control, los próximos lotes y los simuladores', () => {
    mockLiveState({
      snapshot: makeSnapshot(),
      upcomingLotes: [makeLote({ id: 'lote-2', title: 'Vaquillona', status: 'pending' })],
    });

    renderPage();

    expect(screen.getByText('Toro Angus')).toBeInTheDocument(); // ConsolaLotePanel
    expect(screen.getByText('Panel de control operativo')).toBeInTheDocument(); // ConsolaControlPanel
    expect(screen.getByText('Vaquillona')).toBeInTheDocument(); // ConsolaUpcomingLotesPanel
    // Simuladores (Bots) vive en el panel del rematador operador, no en el de la
    // empresa -- pedido explícito, herramienta de testeo temporal.
    expect(screen.getByText('Simuladores (mock)')).toBeInTheDocument(); // ConsolaBotsPanel
  });

  it('remate "live", viewer dueño del remate (empresa): oculta la botonera y los simuladores, muestra la analítica en su lugar', () => {
    useAuthMock.mockReturnValue({ user: { id: 'owner-1', role: 'empresa' } });
    mockLiveState({ snapshot: makeSnapshot() });

    renderPage();

    expect(screen.getByText('Toro Angus')).toBeInTheDocument(); // ConsolaLotePanel sigue visible
    expect(screen.queryByText('Panel de control operativo')).not.toBeInTheDocument(); // ConsolaControlPanel
    expect(screen.getByText('Analítica en tiempo real (mock)')).toBeInTheDocument(); // AnalyticsPanel
    expect(screen.queryByText('Simuladores (mock)')).not.toBeInTheDocument(); // ConsolaBotsPanel
  });

  it('el historial de ofertas del sidebar queda siempre visible, sin pestaña', () => {
    mockLiveState({ snapshot: makeSnapshot() });

    renderPage();

    expect(screen.getByText('Ofertas recientes')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Ofertas' })).not.toBeInTheDocument();
  });

  it('el breadcrumb muestra el título del remate', () => {
    mockLiveState({ snapshot: makeSnapshot() });
    renderPage();
    // El breadcrumb ya no se renderiza dentro de la página (Épica 9, Etapa 2) -- lo
    // dibuja el `Header` global a partir de `useBreadcrumbStore`, que la página setea.
    expect(useBreadcrumbStore.getState().items).toEqual([
      { label: 'Mis remates', to: '/' },
      { label: 'Remate de hacienda' },
    ]);
  });

  it('el sidebar tiene una pestaña de Conectados (compradores, vía Moderación)', () => {
    // Épica 9, Etapa 5: reemplaza al `ConnectedUsersList` genérico (anonimizado, sin
    // acciones) que vivía antes acá -- ahora reusa `ConnectedBuyersList` de Moderación
    // (nombre, búsqueda, silenciar/expulsar), ver `ConsolaSidebar.test.tsx` para la
    // cobertura del cambio de pestañas en detalle.
    mockLiveState({ snapshot: makeSnapshot() });
    renderPage();

    expect(screen.getByRole('tab', { name: 'Conectados' })).toBeInTheDocument();
  });

  it('pide el layout ancho (Épica 9, Etapa 5 -- sidebar con pestañas)', () => {
    mockLiveState({ snapshot: makeSnapshot() });

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isWide).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isWide).toBe(false);
  });

  it('remate "live": activa Modo Remate (oculta sidebar/header global vía AppLayout)', () => {
    mockLiveState({ snapshot: makeSnapshot() });

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);
  });

  it('remate "scheduled": no activa Modo Remate -- no hay nada en vivo que proteger de distracciones', () => {
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ status: 'scheduled' }), active_lote: null }) });

    renderPage();

    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);
  });

});
