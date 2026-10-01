import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

// `TimedSalaPage` arma su propio estado (`useTimedSalaState`, ver
// `features/timedSala/hooks.ts`) -- acá solo interesa que `SalaPage` delegue en ella
// para un remate TIMED, no volver a probar esa pantalla completa desde este archivo.
vi.mock('../../timedSala/pages/TimedSalaPage', () => ({
  TimedSalaPage: () => <div data-testid="timed-sala-page" />,
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
    desiertoLotes: [],
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

    expect(screen.getByRole('heading', { level: 1, name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getAllByText('3 conectados').length).toBeGreaterThanOrEqual(1);
    // Con la conexión abierta no hay aviso de conexión: solo aparece si algo anda mal.
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    // Sin pestañas: las ofertas recientes y el chat se ven a la vez.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Ofertas recientes/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chat del remate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Próximos lotes' })).toBeInTheDocument();
    expect(screen.getByText('Vaquillona')).toBeInTheDocument();
    // Sin mock de sesión, `useAuth()` real devuelve un visitante anónimo (ADR-049) --
    // ve el llamado a iniciar sesión, no el botón deshabilitado por rol.
    expect(screen.getByRole('button', { name: 'Iniciá sesión para ofertar' })).toBeInTheDocument();
  });

  it('sin transmisión cargada, no muestra ningún video (la sala queda como siempre)', () => {
    mockLiveState();

    renderPage();

    expect(screen.queryByTitle(/Transmisión en vivo/)).not.toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
  });

  it('con transmisión cargada, muestra el video fijo y el lote actual debajo', () => {
    mockLiveState({
      snapshot: makeSnapshot({
        remate: makeRemate({ stream_provider: 'youtube', stream_video_id: 'dQw4w9WgXcQ' }),
      }),
    });

    renderPage();

    const iframe = screen.getByTitle('Transmisión en vivo: Remate de hacienda');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1',
    );
    const lote = screen.getByText('Toro Angus');
    expect(lote).toBeInTheDocument();
    // El video va ANTES que el lote en el documento (arriba, en la misma columna).
    expect(iframe.compareDocumentPosition(lote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^Ofertas recientes/ })).toBeInTheDocument();
  });

  it('con transmisión y sin lote activo, deja el video y muestra el estado vacío debajo', () => {
    mockLiveState({
      snapshot: makeSnapshot({
        active_lote: null,
        remate: makeRemate({ stream_provider: 'youtube', stream_video_id: 'dQw4w9WgXcQ' }),
      }),
    });

    renderPage();

    expect(screen.getByTitle('Transmisión en vivo: Remate de hacienda')).toBeInTheDocument();
    expect(screen.getByText('No hay ningún lote abierto en este momento')).toBeInTheDocument();
  });

  it('para un remate Timed, delega en TimedSalaPage en vez de la sala LIVE', () => {
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ auction_type: 'timed' }) }) });

    renderPage();

    expect(screen.getByTestId('timed-sala-page')).toBeInTheDocument();
    expect(screen.queryByText('Toro Angus')).not.toBeInTheDocument();
  });

  it('mientras la conexión se reestablece, la cabecera muestra "Reconectando..."', () => {
    mockLiveState({ connectionStatus: 'reconnecting' });

    renderPage();

    expect(screen.getByText('Reconectando...')).toBeInTheDocument();
  });

  it('oculta el navbar global (breadcrumb) mientras muestra la sala (rediseño vista comprador)', () => {
    mockLiveState();

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);
  });

  it('usa la barra superior fija (nav completo al principio de la página) en un remate en vivo', () => {
    mockLiveState();

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);
    expect(useLayoutPreferencesStore.getState().isTopNavStatic).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(false);
    expect(useLayoutPreferencesStore.getState().isTopNavStatic).toBe(false);
  });

  it('un remate Timed también usa la barra superior fija', () => {
    mockLiveState({ snapshot: makeSnapshot({ remate: makeRemate({ auction_type: 'timed' }) }) });

    renderPage();

    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);
    expect(useLayoutPreferencesStore.getState().isTopNavStatic).toBe(true);
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(true);
  });

  it('la flecha de la cabecera vuelve a la ficha del remate', () => {
    mockLiveState();

    renderPage();

    expect(screen.getByRole('link', { name: 'Volver al remate' })).toHaveAttribute('href', '/remates/remate-1');
  });

  it('las ofertas recientes marcan la ganadora arriba y las demás como superadas', () => {
    const winner = { id: 'o2', buyer_id: null, amount: '1100.00', status: 'winning' as const, created_at: '2026-07-01T00:00:10Z' };
    const older = { id: 'o1', buyer_id: null, amount: '1050.00', status: 'outbid' as const, created_at: '2026-07-01T00:00:00Z' };
    mockLiveState({ snapshot: makeSnapshot({ winning_offer: winner, recent_offers: [winner, older] }) });

    renderPage();

    const offers = screen.getByRole('heading', { name: /^Ofertas recientes/ }).closest('section')!;
    expect(within(offers).getByText('Ganadora')).toBeInTheDocument();
    expect(within(offers).getByText('Superada')).toBeInTheDocument();
    expect(within(offers).getAllByRole('listitem')).toHaveLength(2);
  });

  it('sin ofertas todavía, lo dice', () => {
    mockLiveState();

    renderPage();

    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
  });

  it('sin lote activo, la mesa de ofertas avisa que el formulario aparece cuando se abra uno', () => {
    mockLiveState({ snapshot: makeSnapshot({ active_lote: null }) });

    renderPage();

    expect(
      screen.getByText('Cuando el martillero abra un lote, el precio y el formulario para ofertar aparecen acá.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Ofertas recientes/ })).not.toBeInTheDocument();
  });

  it('pide el layout ancho (Épica 9, Etapa 4 -- sidebar de ofertas/chat)', () => {
    mockLiveState();

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isWide).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isWide).toBe(false);
  });

  describe('remate.finished (Módulo de lotes desiertos)', () => {
    it('avisa y redirige al comprador al inicio tras una breve pausa, sin dejarlo en la sala', () => {
      navigateMock.mockClear();
      vi.useFakeTimers();
      let capturedListener: (message: unknown) => void = () => {};
      mockLiveState({
        subscribeToRealtime: (listener: (message: unknown) => void) => {
          capturedListener = listener;
          return () => {};
        },
      });

      renderPage();
      capturedListener({
        type: 'domain_event',
        payload: {
          event_type: 'remate.finished',
          event_id: 'e1',
          remate_id: 'remate-1',
          occurred_at: '2026-08-11T00:00:00Z',
          triggered_by: 'manual',
        },
      });

      expect(navigateMock).not.toHaveBeenCalled();
      vi.advanceTimersByTime(4000);
      expect(navigateMock).toHaveBeenCalledWith('/');

      vi.useRealTimers();
    });

    it('no redirige ante otros eventos de dominio', () => {
      navigateMock.mockClear();
      vi.useFakeTimers();
      let capturedListener: (message: unknown) => void = () => {};
      mockLiveState({
        subscribeToRealtime: (listener: (message: unknown) => void) => {
          capturedListener = listener;
          return () => {};
        },
      });

      renderPage();
      capturedListener({
        type: 'domain_event',
        payload: { event_type: 'lote.opened', event_id: 'e1', remate_id: 'remate-1', occurred_at: 't', lote_id: 'lote-1', lot_number: '1', display_order: 0 },
      });

      vi.advanceTimersByTime(10000);
      expect(navigateMock).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
