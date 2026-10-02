import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RemateHistoryDetailPage } from './RemateHistoryDetailPage';
import type { Lote, Remate } from '../../remates/types';
import type { PostAuctionCase } from '../../postauction/types';
import type { LoteHistoryDetail, RemateHistoryDetail } from '../types';

const { hooks, exportMocks, navigateMock } = vi.hoisted(() => ({
  hooks: {
    useRemateDetail: vi.fn(),
    useLotes: vi.fn(),
    useRemateHistoryDetail: vi.fn(),
    useLoteResultsForRemate: vi.fn(),
    useLoteHistoryDetail: vi.fn(),
    useVentasAdjudicadasForRemate: vi.fn(),
  },
  exportMocks: { exportRemateHistoryToPdf: vi.fn(), exportRemateHistoryToExcel: vi.fn() },
  navigateMock: vi.fn(),
}));

vi.mock('../../remates/hooks', () => ({ useRemateDetail: hooks.useRemateDetail, useLotes: hooks.useLotes }));
vi.mock('../hooks', () => ({
  useRemateHistoryDetail: hooks.useRemateHistoryDetail,
  useLoteResultsForRemate: hooks.useLoteResultsForRemate,
  useLoteHistoryDetail: hooks.useLoteHistoryDetail,
}));
vi.mock('../../postauction/hooks', () => ({ useVentasAdjudicadasForRemate: hooks.useVentasAdjudicadasForRemate }));
vi.mock('../export', () => exportMocks);
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'r1',
    owner_id: 'o',
    title: 'Hacienda de invernada · Tandil',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: 'Sociedad Rural de Tandil',
    starts_at: '2026-09-01T10:00:00Z',
    ends_at: null,
    status: 'finished',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: '2026-09-01T15:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-09-01T15:00:00Z',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<RemateHistoryDetail> = {}): RemateHistoryDetail {
  return {
    remate_id: 'r1',
    title: 'Hacienda de invernada · Tandil',
    category: 'hacienda',
    status: 'finished',
    starts_at: '2026-09-01T10:00:00Z',
    finished_at: '2026-09-01T15:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    duration_seconds: 15600,
    lote_status_counts: { pending: 0, open: 0, closed_sold: 2, closed_unsold: 1, cancelled: 0, total: 3 },
    average_lote_duration_seconds: 300,
    total_awarded_value: '3000000.00',
    total_ofertas: 30,
    highest_oferta: { amount: '2000000.00', lot_number: '1', lote_title: 'Novillos Angus' } as RemateHistoryDetail['highest_oferta'],
    top_lote_by_offers: { lot_number: '2', lote_title: 'Vaquillonas', offer_count: 14 } as RemateHistoryDetail['top_lote_by_offers'],
    chat_activity: { message_count: 40, deleted_count: 2, participant_count: 12 },
    participants_count: 18,
    generated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'l1',
    remate_id: 'r1',
    lot_number: '1',
    display_order: 0,
    title: 'Novillos Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000000.00',
    min_increment: '50000.00',
    reserve_price: null,
    final_price: '2000000.00',
    status: 'closed_sold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeCase(overrides: Partial<PostAuctionCase> = {}): PostAuctionCase {
  return {
    id: 'case-1',
    lote_id: 'l1',
    lot_number: '1',
    lote_title: 'Novillos Angus',
    lote_cover_image_url: null,
    remate_id: 'r1',
    remate_title: 'Hacienda de invernada · Tandil',
    buyer_id: 'b1',
    buyer_name: 'Estancia La Margarita',
    rematador_id: 'e1',
    rematador_name: 'Empresa',
    base_price: '1000000.00',
    final_price: '2000000.00',
    status: 'pago_pendiente',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-09-01T16:00:00Z',
    updated_at: '2026-09-01T16:00:00Z',
    ...overrides,
  };
}

function setup({ remate = makeRemate(), detail = makeDetail(), lotes, cases = [] as PostAuctionCase[] }: { remate?: Remate; detail?: RemateHistoryDetail; lotes?: Lote[]; cases?: PostAuctionCase[] } = {}) {
  const items = lotes ?? [
    makeLote(),
    makeLote({ id: 'l2', lot_number: '2', title: 'Vaquillonas', base_price: '1000000.00', final_price: '1100000.00' }),
    makeLote({ id: 'l3', lot_number: '3', title: 'Toros', final_price: null, status: 'closed_unsold' }),
  ];
  hooks.useRemateDetail.mockReturnValue({ remate, isLoading: false, error: null, reload: vi.fn() });
  hooks.useRemateHistoryDetail.mockReturnValue({ data: detail, isLoading: false, error: null, reload: vi.fn() });
  hooks.useLotes.mockReturnValue({ lotes: items, total: items.length, isLoading: false, error: null, reload: vi.fn() });
  hooks.useLoteResultsForRemate.mockReturnValue({
    data: new Map<string, LoteHistoryDetail | null>([['l3', { offer_count: 0 } as LoteHistoryDetail], ['l1', { offer_count: 9, winner: null } as unknown as LoteHistoryDetail]]),
  });
  hooks.useVentasAdjudicadasForRemate.mockReturnValue({ data: cases });
  hooks.useLoteHistoryDetail.mockReturnValue({
    data: {
      id: 'l1',
      status: 'closed_sold',
      offer_count: 2,
      time_open_seconds: 725,
      cancellation_reason: null,
      winner: { buyer_id: 'b1', buyer_name: 'Estancia La Margarita', buyer_email: 'a@b.com', buyer_phone: '+5491100000000', amount: '2000000.00' },
      offer_history: { items: [{ id: 'o1', buyer_id: 'b1', buyer_name: 'Estancia La Margarita', amount: '2000000.00', status: 'winning', rejection_reason: null, created_at: '2026-09-01T10:30:00Z' }], total: 1, page: 1, page_size: 20 },
    },
    isLoading: false,
    error: null,
    reload: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={['/remates/r1/historial']}>
      <Routes>
        <Route path="/remates/:remateId/historial" element={<RemateHistoryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RemateHistoryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre con una frase que resume el remate y los botones de descarga', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hacienda de invernada · Tandil');
    expect(screen.getByText(/Vendiste 2 de 3 lotes por/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar informe PDF/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Descargar Excel/ })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/historial');
  });

  it('muestra los cuatro números y lo más destacado en lenguaje simple', () => {
    setup();

    const happened = screen.getByRole('heading', { name: 'Lo que pasó' }).closest('section') as HTMLElement;
    expect(within(happened).getByText('Lotes vendidos')).toBeInTheDocument();
    expect(within(happened).getByText('2 de 3')).toBeInTheDocument();
    expect(within(happened).getByText('Participantes')).toBeInTheDocument();
    const highlights = screen.getByRole('heading', { name: 'Lo más destacado' }).closest('section') as HTMLElement;
    expect(within(highlights).getByText('Lote 2')).toBeInTheDocument();
    expect(within(highlights).getByText('Vaquillonas · 14 ofertas')).toBeInTheDocument();
    expect(within(highlights).getByText('Lotes sin vender')).toBeInTheDocument();
    expect(within(highlights).getByText('1 sin ofertas')).toBeInTheDocument();
  });

  it('avisa qué ventas quedaron sin cobrar y lleva a Ventas adjudicadas', async () => {
    setup({ cases: [makeCase(), makeCase({ id: 'case-2', lote_id: 'l2', status: 'pago_recibido' })] });

    expect(screen.getByText('1 de 2 ventas todavía sin cobrar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en Ventas adjudicadas' }));
    expect(navigateMock).toHaveBeenCalledWith('/ventas-adjudicadas');
  });

  it('si todo está cobrado, lo dice', () => {
    setup({ cases: [makeCase({ status: 'finalizado' }), makeCase({ id: 'c2', lote_id: 'l2', status: 'entregado' })] });
    expect(screen.getByText('Las 2 ventas ya están cobradas')).toBeInTheDocument();
  });

  it('cada lote muestra su estado, precio base → final, la suba y el ganador', () => {
    setup({ cases: [makeCase()] });

    const lotes = screen.getByRole('heading', { name: 'Resultado de cada lote' }).closest('section') as HTMLElement;
    const list = within(lotes).getByRole('list');
    expect(within(list).getAllByText('Vendido')).toHaveLength(2);
    expect(within(list).getByText('Sin vender')).toBeInTheDocument();
    expect(within(lotes).getByText('+100%')).toBeInTheDocument();
    expect(within(lotes).getByText('Estancia La Margarita')).toBeInTheDocument();
    expect(within(lotes).getByText('Pago pendiente')).toBeInTheDocument();
    expect(within(lotes).getByText('Nadie ofertó')).toBeInTheDocument();
  });

  it('el filtro "Sin vender" deja solo los lotes que no se vendieron', async () => {
    setup();

    await userEvent.click(within(screen.getByRole('group', { name: 'Filtrar lotes' })).getByRole('button', { name: /Sin vender/ }));

    expect(screen.getByRole('button', { name: /Ver el detalle del lote 3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver el detalle del lote 1/ })).not.toBeInTheDocument();
  });

  it('tocar un lote abre su detalle con el ganador y las ofertas', async () => {
    setup({ cases: [makeCase()] });

    await userEvent.click(screen.getByRole('button', { name: /Ver el detalle del lote 1/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Lote 1' });
    expect(within(dialog).getByText('Ganó este lote')).toBeInTheDocument();
    expect(within(dialog).getByText('a@b.com')).toBeInTheDocument();
    expect(within(dialog).getByText('12 min 5 s')).toBeInTheDocument();
    expect(within(dialog).getByText('Ganadora')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Ir a la venta' }));
    expect(navigateMock).toHaveBeenCalledWith('/ventas-adjudicadas/case-1');
  });

  it('el botón de descarga llama al export', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Descargar informe PDF/ }));
    expect(exportMocks.exportRemateHistoryToPdf).toHaveBeenCalledTimes(1);
  });

  it('un remate cancelado muestra el motivo y no las secciones de resultados', () => {
    setup({
      remate: makeRemate({ status: 'cancelled', finished_at: null, cancelled_at: '2026-09-19T10:00:00Z' }),
      detail: makeDetail({ status: 'cancelled', cancelled_at: '2026-09-19T10:00:00Z', cancellation_reason: 'Cambio de fecha del titular', lote_status_counts: { pending: 0, open: 0, closed_sold: 0, closed_unsold: 0, cancelled: 3, total: 3 }, total_awarded_value: '0.00' }),
      lotes: [makeLote({ status: 'cancelled', final_price: null })],
    });

    expect(screen.getByText('Remate cancelado')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Cambio de fecha del titular.')).toBeInTheDocument();
    expect(screen.getByText(/Este remate se canceló el/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lo que pasó' })).not.toBeInTheDocument();
    expect(screen.getByText('No llegó a abrirse')).toBeInTheDocument();
  });

  it('muestra la actividad de la sala con un enlace al registro completo, solo en remates en vivo', () => {
    const { unmount } = setup();
    expect(screen.getByRole('heading', { name: 'Actividad en la sala' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el registro completo de actividad' })).toHaveAttribute('href', '/remates/r1/auditoria');
    unmount();

    setup({ remate: makeRemate({ auction_type: 'timed' }) });
    expect(screen.queryByRole('heading', { name: 'Actividad en la sala' })).not.toBeInTheDocument();
  });

  it('ante un error del remate ofrece reintentar y volver al historial', async () => {
    hooks.useRemateDetail.mockReturnValue({ remate: null, isLoading: false, error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' }, reload: vi.fn() });
    hooks.useRemateHistoryDetail.mockReturnValue({ data: null, isLoading: false, error: null, reload: vi.fn() });
    hooks.useLotes.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });
    hooks.useLoteResultsForRemate.mockReturnValue({ data: new Map() });
    hooks.useVentasAdjudicadasForRemate.mockReturnValue({ data: [] });
    render(
      <MemoryRouter initialEntries={['/remates/r1/historial']}>
        <Routes>
          <Route path="/remates/:remateId/historial" element={<RemateHistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Remate no encontrado.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver al historial' }));
    expect(navigateMock).toHaveBeenCalledWith('/historial');
  });
});
