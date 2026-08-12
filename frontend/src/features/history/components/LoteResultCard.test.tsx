import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoteResultCard } from './LoteResultCard';
import type { Lote } from '../../remates/types';
import type { PostAuctionCase } from '../../postauction/types';
import type { LoteHistoryDetail } from '../types';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 1,
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
    final_price: '1200.00',
    status: 'closed_sold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: false,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeCase(overrides: Partial<PostAuctionCase> = {}): PostAuctionCase {
  return {
    id: 'case-1',
    lote_id: 'lote-1',
    lot_number: '1',
    lote_title: 'Toro Angus',
    lote_cover_image_url: null,
    remate_id: 'remate-1',
    remate_title: 'Remate de prueba',
    buyer_id: 'buyer-1',
    buyer_name: 'Carlos Comprador',
    buyer_email: 'carlos@example.com',
    buyer_phone: '+5491122334455',
    rematador_id: 'owner-1',
    rematador_name: 'Ana Rematadora',
    base_price: '1000.00',
    final_price: '1200.00',
    status: 'pago_recibido',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeOfferDetail(overrides: Partial<LoteHistoryDetail> = {}): LoteHistoryDetail {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    title: 'Toro Angus',
    category: 'hacienda',
    status: 'closed_sold',
    base_price: '1000.00',
    final_price: '1200.00',
    winner: {
      buyer_id: 'buyer-1',
      buyer_name: 'Carlos Comprador',
      buyer_email: 'carlos@example.com',
      buyer_phone: '+5491122334455',
      amount: '1200.00',
    },
    offer_count: 3,
    time_open_seconds: 90,
    opened_at: null,
    closed_at: null,
    cancellation_reason: null,
    offer_history: { items: [], total: 0, page: 1, page_size: 1 },
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof LoteResultCard>> = {}) {
  return render(
    <MemoryRouter>
      <LoteResultCard
        lote={makeLote()}
        currency="ARS"
        offerDetail={makeOfferDetail()}
        postAuctionCase={makeCase()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('LoteResultCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lote vendido: muestra ganador, estado comercial, contacto real y cantidad de ofertas', () => {
    renderCard();

    expect(screen.getByText('Carlos Comprador')).toBeInTheDocument();
    expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    expect(screen.getByText('carlos@example.com')).toBeInTheDocument();
    expect(screen.getByText('+5491122334455')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('ganador sin email/teléfono cargado: muestra "No registrado" en cada fila', () => {
    renderCard({
      postAuctionCase: makeCase({ buyer_email: null, buyer_phone: null }),
      offerDetail: makeOfferDetail({
        winner: { buyer_id: 'buyer-1', buyer_name: 'Carlos Comprador', buyer_email: null, buyer_phone: null, amount: '1200.00' },
      }),
    });

    expect(screen.getAllByText('No registrado')).toHaveLength(2);
  });

  it('"Ir a Ventas Adjudicadas" navega al caso exacto', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Ir a Ventas Adjudicadas' }));
    expect(navigateMock).toHaveBeenCalledWith('/ventas-adjudicadas/case-1');
  });

  it('sin caso post-remate resuelto, el botón queda deshabilitado', () => {
    renderCard({ postAuctionCase: undefined });
    expect(screen.getByRole('button', { name: 'Ir a Ventas Adjudicadas' })).toBeDisabled();
  });

  it('lote desierto: muestra "Sin ofertas válidas" y no la sección de ganador', () => {
    renderCard({
      lote: makeLote({ status: 'closed_unsold', final_price: null }),
      offerDetail: makeOfferDetail({ status: 'closed_unsold', offer_count: 0, winner: null }),
      postAuctionCase: undefined,
    });

    expect(screen.getByText('Sin ofertas válidas')).toBeInTheDocument();
    expect(screen.queryByText('No registrado')).not.toBeInTheDocument();
  });

  it('sin dato de ofertas resuelto todavía, muestra "—"', () => {
    renderCard({ offerDetail: undefined });
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
