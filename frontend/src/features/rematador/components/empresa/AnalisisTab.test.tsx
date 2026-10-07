import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RemateAnalyticsSnapshot } from '../../../analytics/types';
import type { Lote } from '../../../remates/types';
import { AnalisisTab } from './AnalisisTab';

const useRemateLotesMock = vi.hoisted(() => vi.fn());
vi.mock('./useRemateLotes', () => ({ useRemateLotes: useRemateLotesMock }));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'l1', remate_id: 'r1', lot_number: '1', display_order: 0, title: 'Vaquillona', description: null,
    category: 'hacienda', attributes: {}, images: [], quantity: 1, unit_label: null, base_price: '1000.00',
    min_increment: '50.00', reserve_price: null, final_price: null, status: 'pending', timer_ends_at: null,
    timer_paused_remaining_seconds: null, timer_auto_close_enabled: true, round_number: 1,
    created_at: '2026-07-01T00:00:00Z', ...overrides,
  };
}

const analytics: RemateAnalyticsSnapshot = {
  schema_version: 1, remate_id: 'r1', connected_users_total: 6, connected_buyers: 4,
  lote_status_counts: { pending: 1, open: 0, closed_sold: 1, closed_unsold: 1, cancelled: 0, total: 3 },
  average_lote_duration_seconds: 90, total_awarded_value: '1500.00', total_ofertas: 6, ofertas_per_minute: 1,
  highest_oferta: { oferta_id: 'o', lote_id: 'l1', lot_number: '1', lote_title: 'Vaquillona', buyer_id: 'b', amount: '1500.00', status: 'winning', created_at: '2026-07-01T12:00:00Z' },
  top_lote_by_offers: { lote_id: 'l1', lot_number: '1', lote_title: 'Vaquillona', offer_count: 6 },
  offers_by_lote: [{ lote_id: 'l1', offer_count: 6 }],
  bids_timeline: [{ bucket_start: '2026-07-01T12:00:00Z', count: 1 }, { bucket_start: '2026-07-01T12:01:00Z', count: 5 }],
  bids_timeline_granularity: 'minute',
  recent_events: [{ event_type: 'lote.closed_sold', occurred_at: '2026-07-01T12:02:00Z', lote_id: 'l1', lot_number: '1', lote_title: 'Vaquillona', final_price: '1500.00' }],
  generated_at: '2026-07-01T12:02:00Z',
};

function setup(data: RemateAnalyticsSnapshot | null, hasError = false) {
  useRemateLotesMock.mockReturnValue({ lotes: [makeLote({ status: 'closed_sold', final_price: '1500.00' })], total: 1, isLoading: false, error: null, reload: vi.fn() });
  render(<AnalisisTab remateId="r1" analytics={data} hasError={hasError} currency="ARS" />);
}

describe('AnalisisTab', () => {
  it('muestra competencia, suba sobre la base y audiencia', () => {
    setup(analytics);
    expect(screen.getByLabelText('Lotes con más ofertas')).toHaveTextContent('Lote 1 · Vaquillona');
    expect(screen.getByLabelText('Lotes con más ofertas')).toHaveTextContent('6 ofertas');
    expect(screen.getByLabelText('Lotes que más subieron sobre su base')).toHaveTextContent('+50 %');
    expect(screen.getByText('Otras personas conectadas')).toBeInTheDocument();
    expect(screen.getByText('1 lote cerró sin ofertas.')).toBeInTheDocument();
  });

  it('con error y sin datos, avisa que no se pudo cargar', () => {
    setup(null, true);
    expect(screen.getByText(/No se pudo cargar el análisis/)).toBeInTheDocument();
  });

  it('cargando, muestra el estado de espera', () => {
    setup(null);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
