import { describe, expect, it } from 'vitest';
import {
  applyDomainEventToLeadingAmounts,
  applyDomainEventToLeadingBuyerIds,
  type LeadingAmountsByLote,
  type LeadingBuyerIdsByLote,
} from './realtime';
import type { SalaDomainEvent } from '../sala/realtime/events';

function baseEvent() {
  return { event_id: 'e1', remate_id: 'r1', occurred_at: '2026-08-01T00:00:00Z' };
}

describe('applyDomainEventToLeadingAmounts', () => {
  it('oferta.accepted actualiza únicamente el lote de ese evento', () => {
    const initial: LeadingAmountsByLote = { 'lote-1': '1000.00', 'lote-2': null };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'oferta.accepted',
      oferta_id: 'o1',
      lote_id: 'lote-1',
      buyer_id: 'b1',
      amount: '1100.00',
    };

    const result = applyDomainEventToLeadingAmounts(initial, event);

    expect(result['lote-1']).toBe('1100.00');
    expect(result['lote-2']).toBeNull();
  });

  it('lote.closed vendido fija el monto final', () => {
    const initial: LeadingAmountsByLote = { 'lote-1': '1100.00' };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'lote.closed',
      lote_id: 'lote-1',
      outcome: 'sold',
      final_price: '1200.00',
      triggered_by: 'auto',
    };

    expect(applyDomainEventToLeadingAmounts(initial, event)['lote-1']).toBe('1200.00');
  });

  it('lote.closed desierto conserva el último monto conocido (nunca hubo ninguno acá)', () => {
    const initial: LeadingAmountsByLote = { 'lote-1': null };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'lote.closed',
      lote_id: 'lote-1',
      outcome: 'unsold',
      final_price: null,
      triggered_by: 'auto',
    };

    expect(applyDomainEventToLeadingAmounts(initial, event)['lote-1']).toBeNull();
  });

  it('eventos de otro tipo no tocan el mapa', () => {
    const initial: LeadingAmountsByLote = { 'lote-1': '1000.00' };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'lote.timer_extended',
      lote_id: 'lote-1',
      ends_at: '2026-08-01T00:05:00Z',
      extended_by_seconds: 90,
    };

    expect(applyDomainEventToLeadingAmounts(initial, event)).toBe(initial);
  });
});

describe('applyDomainEventToLeadingBuyerIds', () => {
  it('oferta.accepted fija el buyer_id real de ese lote, sin tocar los demás', () => {
    const initial: LeadingBuyerIdsByLote = { 'lote-1': 'buyer-a', 'lote-2': null };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'oferta.accepted',
      oferta_id: 'o1',
      lote_id: 'lote-1',
      buyer_id: 'buyer-b',
      amount: '1100.00',
    };

    const result = applyDomainEventToLeadingBuyerIds(initial, event);

    expect(result['lote-1']).toBe('buyer-b');
    expect(result['lote-2']).toBeNull();
  });

  it('oferta.winner_changed fija el new_buyer_id (no el previous_buyer_id)', () => {
    const initial: LeadingBuyerIdsByLote = { 'lote-1': 'buyer-a' };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'oferta.winner_changed',
      lote_id: 'lote-1',
      previous_oferta_id: 'o1',
      previous_buyer_id: 'buyer-a',
      new_oferta_id: 'o2',
      new_buyer_id: 'buyer-c',
      new_amount: '1200.00',
    };

    expect(applyDomainEventToLeadingBuyerIds(initial, event)['lote-1']).toBe('buyer-c');
  });

  it('lote.opened y lote.requeued limpian el líder anterior de ese lote', () => {
    const initial: LeadingBuyerIdsByLote = { 'lote-1': 'buyer-a' };
    const opened: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'lote.opened',
      lote_id: 'lote-1',
      lot_number: '1',
      display_order: 0,
    };

    expect(applyDomainEventToLeadingBuyerIds(initial, opened)['lote-1']).toBeNull();

    const requeued: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'lote.requeued',
      lote_id: 'lote-1',
      lot_number: '1',
      display_order: 0,
      round_number: 2,
      base_price: '1000.00',
      min_increment: '50.00',
      reserve_price: null,
    };

    expect(applyDomainEventToLeadingBuyerIds(initial, requeued)['lote-1']).toBeNull();
  });

  it('eventos de otro tipo no tocan el mapa', () => {
    const initial: LeadingBuyerIdsByLote = { 'lote-1': 'buyer-a' };
    const event: SalaDomainEvent = {
      ...baseEvent(),
      event_type: 'lote.timer_extended',
      lote_id: 'lote-1',
      ends_at: '2026-08-01T00:05:00Z',
      extended_by_seconds: 90,
    };

    expect(applyDomainEventToLeadingBuyerIds(initial, event)).toBe(initial);
  });
});
