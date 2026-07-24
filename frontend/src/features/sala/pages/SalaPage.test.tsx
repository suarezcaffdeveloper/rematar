import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useBreadcrumbStore } from '../../../app/layouts/breadcrumbStore';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { SalaPage } from './SalaPage';
import type { Lote, Remate } from '../../remates/types';
import type { UseLiveRemateStateResult } from '../hooks';
import type { RemateStateSnapshot } from '../types';

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

vi.mock('../hooks', () => ({ useLiveRemateState: useLiveRemateStateMock }));

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
    connected_users: 3,
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
      <SalaPage />
    </MemoryRouter>,
  );
}

describe('SalaPage', () => {
  it('mientras carga el snapshot, muestra esqueletos', () => {
    mockLiveState({ snapshot: null, isLoading: true, connectionStatus: 'connecting' });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Realizar oferta')).not.toBeInTheDocument();
  });

  it('si el snapshot falla, muestra el error con reintentar y volver al dashboard', async () => {
    const reload = vi.fn();
    mockLiveState({
      snapshot: null,
      error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' },
      reload,
    });

    renderPage();

    expect(screen.getByText('Remate no encontrado.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('sin lote activo, muestra el estado vacío en vez del panel de lote', () => {
    mockLiveState({ snapshot: makeSnapshot({ active_lote: null }) });

    renderPage();

    expect(screen.getByText('No hay ningún lote abierto en este momento')).toBeInTheDocument();
    expect(screen.queryByText('Toro Angus')).not.toBeInTheDocument();
  });

  it('con lote activo, renderiza cabecera, panel principal, panel lateral, próximos lotes y estado de conexión', () => {
    mockLiveState({
      upcomingLotes: [makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona', status: 'pending' })],
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Remate de hacienda' })).toBeInTheDocument();
    // Aparece dos veces: en SalaHeader y en el header del ChatPanel (ambos usan PresenceCounter).
    expect(screen.getAllByText('3 conectados').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Conectado')).toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Comprador líder')).toBeInTheDocument();
    expect(screen.getByText('Vaquillona')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
  });

  it('mientras la conexión se reestablece, la cabecera muestra "Reconectando..."', () => {
    mockLiveState({ connectionStatus: 'reconnecting' });

    renderPage();

    expect(screen.getByText('Reconectando...')).toBeInTheDocument();
  });

  it('el breadcrumb va al detalle del remate, no directo a la sala', () => {
    mockLiveState();

    renderPage();

    // El breadcrumb ya no se renderiza dentro de la página (Épica 9, Etapa 2) -- lo
    // dibuja el `Header` global a partir de `useBreadcrumbStore`, que la página setea.
    expect(useBreadcrumbStore.getState().items).toEqual([
      { label: 'Dashboard', to: '/' },
      { label: 'Remate de hacienda', to: '/remates/remate-1' },
      { label: 'Sala en vivo' },
    ]);
  });

  it('pide el layout ancho (Épica 9, Etapa 4 -- sidebar de ofertas/chat)', () => {
    mockLiveState();

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isWide).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isWide).toBe(false);
  });
});
