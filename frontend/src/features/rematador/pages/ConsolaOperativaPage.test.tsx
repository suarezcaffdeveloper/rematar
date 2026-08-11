import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useBreadcrumbStore } from '../../../app/layouts/breadcrumbStore';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { ConsolaOperativaPage } from './ConsolaOperativaPage';
import type { Lote, Remate } from '../../remates/types';
import type { UseLiveRemateStateResult } from '../../sala/hooks';
import type { RemateStateSnapshot } from '../../sala/types';

const { navigateMock, useLiveRemateStateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLiveRemateStateMock: vi.fn(),
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

  it('remate "finished": mensaje específico, sin paneles', () => {
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ status: 'finished' }), active_lote: null }) });
    renderPage();
    expect(screen.getByText(/ya finalizó/)).toBeInTheDocument();
  });

  it('remate "live", con lote activo: muestra el lote, el control y los próximos lotes', () => {
    mockLiveState({
      snapshot: makeSnapshot(),
      upcomingLotes: [makeLote({ id: 'lote-2', title: 'Vaquillona', status: 'pending' })],
    });

    renderPage();

    expect(screen.getByText('Toro Angus')).toBeInTheDocument(); // ConsolaLotePanel
    expect(screen.getByText('Panel de control operativo')).toBeInTheDocument(); // ConsolaControlPanel
    expect(screen.getByText('Vaquillona')).toBeInTheDocument(); // ConsolaUpcomingLotesPanel
  });

  it('el historial de ofertas del sidebar queda siempre visible, sin pestaña', () => {
    mockLiveState({ snapshot: makeSnapshot() });

    renderPage();

    expect(screen.getByText('Historial reciente')).toBeInTheDocument();
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
