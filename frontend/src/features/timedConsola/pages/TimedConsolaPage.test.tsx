import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useBreadcrumbStore } from '../../../app/layouts/breadcrumbStore';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import type { Lote, Remate } from '../../remates/types';
import type { UseTimedSalaStateResult } from '../../timedSala/hooks';
import type { RemateAnalyticsSnapshot } from '../../analytics/types';
import { TimedConsolaPage } from './TimedConsolaPage';

const { useTimedSalaStateMock, useAuthMock, useRemateAnalyticsMock } = vi.hoisted(() => ({
  useTimedSalaStateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useRemateAnalyticsMock: vi.fn(),
}));

vi.mock('../../timedSala/hooks', () => ({ useTimedSalaState: useTimedSalaStateMock }));
vi.mock('../../auth/hooks', () => ({ useAuth: useAuthMock }));
vi.mock('../../analytics/hooks', () => ({ useRemateAnalytics: useRemateAnalyticsMock }));
vi.mock('../../analytics/components/AnalyticsPanel', () => ({
  AnalyticsPanel: () => <div>Analítica en tiempo real (mock)</div>,
}));
vi.mock('../../rematador/components/PrivateAccessPanel', () => ({
  PrivateAccessPanel: () => <div>Acceso privado (mock)</div>,
}));
vi.mock('../components/TimedLoteDetailModal', () => ({
  TimedLoteDetailModal: ({ lote }: { lote: Lote }) => <div>Detalle {lote.title} (mock)</div>,
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate Timed de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: null,
    status: 'live',
    auction_type: 'timed',
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

function mockState(overrides: Partial<UseTimedSalaStateResult> = {}) {
  useTimedSalaStateMock.mockReturnValue({
    remate: makeRemate(),
    lotes: [makeLote()],
    leadingAmounts: {},
    leadingBuyerIds: {},
    offerActivityVersion: {},
    isLoading: false,
    error: null,
    reload: vi.fn(),
    connectionStatus: 'open',
    subscribeToRealtime: () => () => {},
    ...overrides,
  });
}

function mockAnalytics(data: Partial<RemateAnalyticsSnapshot> | null) {
  useRemateAnalyticsMock.mockReturnValue({
    data: data && ({ total_ofertas: 0, connected_buyers: 0, offers_by_lote: [], ...data } as RemateAnalyticsSnapshot),
    isInitialLoading: false,
    initialError: null,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TimedConsolaPage remateId="remate-1" />
    </MemoryRouter>,
  );
}

describe('TimedConsolaPage', () => {
  beforeEach(() => {
    useBreadcrumbStore.setState({ items: [] });
    useLayoutPreferencesStore.setState({ ...useLayoutPreferencesStore.getState() });
    useAuthMock.mockReturnValue({ user: { id: 'owner-1' } });
    mockState();
    mockAnalytics(null);
  });

  it('no es la consola en vivo: sin botonera ni chat, con el badge Timed Auction', () => {
    renderPage();
    expect(screen.getByText('Timed Auction')).toBeInTheDocument();
    expect(screen.queryByText(/chat/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Próximos lotes')).not.toBeInTheDocument();
  });

  it('muestra una tarjeta por lote con precio actual y base', () => {
    mockState({
      lotes: [makeLote(), makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaca Hereford' })],
      leadingAmounts: { 'lote-1': '1500.00' },
    });
    renderPage();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Vaca Hereford')).toBeInTheDocument();
    expect(screen.getByText('Precio actual')).toBeInTheDocument();
    expect(screen.getByText('Base de apertura')).toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
  });

  it('con analítica, muestra la cantidad de ofertas por lote', () => {
    mockState({ lotes: [makeLote(), makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaca Hereford' })] });
    mockAnalytics({ offers_by_lote: [{ lote_id: 'lote-1', offer_count: 3 }] });
    renderPage();
    expect(screen.getByText('3 ofertas')).toBeInTheDocument();
    expect(screen.getByText('Sin ofertas')).toBeInTheDocument();
  });

  it('el dueño ve la analítica; el rematador operador no', () => {
    const { unmount } = renderPage();
    expect(screen.getByText('Analítica en tiempo real (mock)')).toBeInTheDocument();
    unmount();

    useAuthMock.mockReturnValue({ user: { id: 'rematador-9' } });
    renderPage();
    expect(screen.queryByText('Analítica en tiempo real (mock)')).not.toBeInTheDocument();
  });

  it('nunca muestra credenciales del martillero (un Timed no tiene operador en vivo)', () => {
    renderPage();
    expect(screen.queryByText(/Datos para el martillero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Código de operador/i)).not.toBeInTheDocument();
  });

  it('remate privado: el dueño ve los datos de acceso para compradores', () => {
    mockState({ remate: makeRemate({ access_type: 'private' }) });
    renderPage();
    expect(screen.getByText('Acceso privado (mock)')).toBeInTheDocument();
  });

  it('remate público: no muestra datos de acceso privado', () => {
    renderPage();
    expect(screen.queryByText('Acceso privado (mock)')).not.toBeInTheDocument();
  });

  it('clic en una tarjeta abre el detalle del lote', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Ver detalle del lote 1/ }));
    expect(screen.getByText('Detalle Toro Angus (mock)')).toBeInTheDocument();
  });

  it('remate sin lotes muestra el estado vacío', () => {
    mockState({ lotes: [] });
    renderPage();
    expect(screen.getByText('Este remate todavía no tiene lotes')).toBeInTheDocument();
  });
});
