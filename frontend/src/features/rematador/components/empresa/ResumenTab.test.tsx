import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RemateAnalyticsSnapshot } from '../../../analytics/types';
import type { Lote } from '../../../remates/types';
import { ResumenTab, type ResumenAlert } from './ResumenTab';

const useLotesMock = vi.hoisted(() => vi.fn());
vi.mock('./useRemateLotes', () => ({ useRemateLotes: useLotesMock }));

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
  schema_version: 1, remate_id: 'r1', connected_users_total: 5, connected_buyers: 4,
  lote_status_counts: { pending: 2, open: 1, closed_sold: 1, closed_unsold: 0, cancelled: 0, total: 4 },
  average_lote_duration_seconds: null, total_awarded_value: '1200.00', total_ofertas: 7, ofertas_per_minute: 1.5,
  highest_oferta: null, top_lote_by_offers: null, offers_by_lote: [],
  bids_timeline: [{ bucket_start: 'a', count: 1 }, { bucket_start: 'b', count: 3 }], bids_timeline_granularity: 'minute',
  recent_events: [{ event_type: 'lote.closed_sold', occurred_at: '2026-07-01T12:00:00Z', lote_id: 'l1', lot_number: '1', lote_title: 'Vaquillona', final_price: '1200.00' }],
  generated_at: '2026-07-01T12:00:00Z',
};

function setup(props: { analytics?: RemateAnalyticsSnapshot | null; alerts?: ResumenAlert[]; onGoTo?: () => void } = {}) {
  useLotesMock.mockReturnValue({ lotes: [makeLote({ status: 'closed_sold', final_price: '1200.00' })], total: 1, isLoading: false, error: null, reload: vi.fn() });
  const onGoTo = props.onGoTo ?? vi.fn();
  render(
    <ResumenTab
      remateId="r1"
      analytics={props.analytics === undefined ? analytics : props.analytics}
      alerts={props.alerts ?? []}
      upcomingLotes={[makeLote({ id: 'l2', lot_number: '2', title: 'Novillo' })]}
      currency="ARS"
      onGoTo={onGoTo}
    />,
  );
  return onGoTo;
}

describe('ResumenTab', () => {
  it('muestra cifras, suba sobre la base y siguiente lote', () => {
    setup();
    expect(screen.getByText('1 de 4')).toBeInTheDocument();
    expect(screen.getByText('+20 % sobre los precios base')).toBeInTheDocument();
    expect(screen.getByText('Quedan 3 por rematar')).toBeInTheDocument();
    expect(screen.getByText(/Lote 2 · Novillo/)).toBeInTheDocument();
    expect(screen.getByText('Lote vendido')).toBeInTheDocument();
  });

  it('sin avisos, dice que todo está en orden', () => {
    setup();
    expect(screen.getByText(/Todo en orden/)).toBeInTheDocument();
  });

  it('el aviso lleva a la pestaña correspondiente', async () => {
    const onGoTo = setup({ alerts: [{ id: 'no-stream', level: 'info', title: 'Sin transmisión', detail: 'x', action: { label: 'Cargar transmisión', target: 'equipo' } }] });
    await userEvent.click(screen.getByRole('button', { name: /Cargar transmisión/ }));
    expect(onGoTo).toHaveBeenCalledWith('equipo');
  });

  it('sin analítica, muestra el estado de carga', () => {
    setup({ analytics: null });
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
