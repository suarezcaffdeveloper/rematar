import { describe, expect, it } from 'vitest';
import { computeMinimumAmount } from './bidding';
import type { Lote } from '../remates/types';
import type { OfertaSnapshotEntry } from './types';

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

describe('computeMinimumAmount', () => {
  it('sin ofertas, el mínimo es el precio base', () => {
    expect(computeMinimumAmount(makeLote({ base_price: '1000.00' }), null)).toBe('1000.00');
  });

  it('con una oferta vigente, el mínimo suma el incremento mínimo', () => {
    const winningOffer: OfertaSnapshotEntry = {
      id: 'o1',
      buyer_id: null,
      amount: '1000.00',
      status: 'accepted',
      created_at: '2026-07-01T00:00:00Z',
    };
    expect(computeMinimumAmount(makeLote({ min_increment: '50.00' }), winningOffer)).toBe('1050.00');
  });
});
