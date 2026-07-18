import { describe, expect, it } from 'vitest';
import type { Lote, Remate } from '../../remates/types';
import type { OfertaSnapshotEntry, RemateStateSnapshot } from '../types';
import { applyDomainEventToLotes, applyDomainEventToSnapshot } from './reducer';
import type { SalaDomainEvent } from './events';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
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
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<RemateStateSnapshot> = {}): RemateStateSnapshot {
  return {
    schema_version: 1,
    remate: makeRemate(),
    active_lote: null,
    winning_offer: null,
    recent_offers: [],
    connected_users: 1,
    generated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeOffer(overrides: Partial<OfertaSnapshotEntry> = {}): OfertaSnapshotEntry {
  return { id: 'oferta-1', buyer_id: null, amount: '1000.00', status: 'winning', created_at: '2026-07-01T00:00:00Z', ...overrides };
}

describe('applyDomainEventToSnapshot', () => {
  it('remate.started pone el remate en "live"', () => {
    const snapshot = makeSnapshot({ remate: makeRemate({ status: 'scheduled' }) });
    const event: SalaDomainEvent = {
      event_type: 'remate.started',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: '2026-07-02T00:00:00Z',
    };

    const result = applyDomainEventToSnapshot(snapshot, event, []);

    expect(result.remate.status).toBe('live');
    // No reconstruye el resto del objeto -- misma referencia de settings.
    expect(result.remate.settings).toBe(snapshot.remate.settings);
  });

  it('remate.paused / remate.resumed alternan el estado', () => {
    const snapshot = makeSnapshot({ remate: makeRemate({ status: 'live' }) });
    const paused = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'remate.paused', event_id: 'e1', remate_id: 'remate-1', occurred_at: 't' },
      [],
    );
    expect(paused.remate.status).toBe('paused');

    const resumed = applyDomainEventToSnapshot(
      paused,
      { event_type: 'remate.resumed', event_id: 'e2', remate_id: 'remate-1', occurred_at: 't' },
      [],
    );
    expect(resumed.remate.status).toBe('live');
  });

  it('remate.finished registra finished_at', () => {
    const snapshot = makeSnapshot();
    const result = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'remate.finished', event_id: 'e1', remate_id: 'remate-1', occurred_at: '2026-07-02T10:00:00Z', triggered_by: 'auto' },
      [],
    );
    expect(result.remate.status).toBe('finished');
    expect(result.remate.finished_at).toBe('2026-07-02T10:00:00Z');
  });

  it('remate.cancelled registra motivo y fecha', () => {
    const snapshot = makeSnapshot();
    const result = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'remate.cancelled', event_id: 'e1', remate_id: 'remate-1', occurred_at: '2026-07-02T10:00:00Z', reason: 'Fuerza mayor' },
      [],
    );
    expect(result.remate.status).toBe('cancelled');
    expect(result.remate.cancellation_reason).toBe('Fuerza mayor');
    expect(result.remate.cancelled_at).toBe('2026-07-02T10:00:00Z');
  });

  it('lote.opened reemplaza active_lote con el lote completo (buscado en la lista de useLotes) y limpia ofertas', () => {
    const snapshot = makeSnapshot({
      active_lote: null,
      winning_offer: makeOffer(),
      recent_offers: [makeOffer()],
    });
    const lotes = [makeLote({ id: 'lote-2', title: 'Vaquillona', status: 'pending' })];
    const event: SalaDomainEvent = {
      event_type: 'lote.opened',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-2',
      lot_number: '2',
      display_order: 1,
    };

    const result = applyDomainEventToSnapshot(snapshot, event, lotes);

    expect(result.active_lote?.id).toBe('lote-2');
    expect(result.active_lote?.status).toBe('open');
    expect(result.winning_offer).toBeNull();
    expect(result.recent_offers).toEqual([]);
  });

  it('lote.opened sin el lote todavía cargado en useLotes no rompe -- deja el snapshot intacto', () => {
    const snapshot = makeSnapshot();
    const event: SalaDomainEvent = {
      event_type: 'lote.opened',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-inexistente',
      lot_number: '9',
      display_order: 9,
    };

    expect(applyDomainEventToSnapshot(snapshot, event, [])).toBe(snapshot);
  });

  it('lote.closed del lote activo lo limpia; de otro lote no cambia nada', () => {
    const snapshot = makeSnapshot({ active_lote: makeLote({ id: 'lote-1', status: 'open' }) });

    const closedOther = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'lote.closed', event_id: 'e1', remate_id: 'remate-1', occurred_at: 't', lote_id: 'otro', outcome: 'sold', final_price: '1200.00' },
      [],
    );
    expect(closedOther).toBe(snapshot);

    const closedActive = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'lote.closed', event_id: 'e2', remate_id: 'remate-1', occurred_at: 't', lote_id: 'lote-1', outcome: 'sold', final_price: '1200.00' },
      [],
    );
    expect(closedActive.active_lote).toBeNull();
  });

  it('lote.cancelled del lote activo lo limpia', () => {
    const snapshot = makeSnapshot({ active_lote: makeLote({ id: 'lote-1', status: 'open' }) });
    const result = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'lote.cancelled', event_id: 'e1', remate_id: 'remate-1', occurred_at: 't', lote_id: 'lote-1', reason: 'Retirado' },
      [],
    );
    expect(result.active_lote).toBeNull();
  });

  it('oferta.accepted agrega la entrada al historial (con buyer_id anonimizado) y la marca ganadora', () => {
    const snapshot = makeSnapshot({ winning_offer: null, recent_offers: [] });
    const result = applyDomainEventToSnapshot(
      snapshot,
      {
        event_type: 'oferta.accepted',
        event_id: 'e1',
        remate_id: 'remate-1',
        occurred_at: '2026-07-02T10:00:00Z',
        oferta_id: 'oferta-9',
        lote_id: 'lote-1',
        buyer_id: 'comprador-real-123',
        amount: '1500.00',
      },
      [],
    );

    expect(result.winning_offer).toEqual({
      id: 'oferta-9',
      buyer_id: null,
      amount: '1500.00',
      status: 'winning',
      created_at: '2026-07-02T10:00:00Z',
    });
    expect(result.recent_offers[0].buyer_id).toBeNull();
  });

  it('oferta.accepted acumula en recent_offers respetando el tope de 10', () => {
    const existing = Array.from({ length: 10 }, (_, i) => makeOffer({ id: `oferta-${i}` }));
    const snapshot = makeSnapshot({ recent_offers: existing });

    const result = applyDomainEventToSnapshot(
      snapshot,
      {
        event_type: 'oferta.accepted',
        event_id: 'e1',
        remate_id: 'remate-1',
        occurred_at: 't',
        oferta_id: 'oferta-nueva',
        lote_id: 'lote-1',
        buyer_id: 'x',
        amount: '2000.00',
      },
      [],
    );

    expect(result.recent_offers).toHaveLength(10);
    expect(result.recent_offers[0].id).toBe('oferta-nueva');
    expect(result.recent_offers.find((o) => o.id === 'oferta-9')).toBeUndefined();
  });

  it('oferta.winner_changed marca la oferta anterior como superada', () => {
    const snapshot = makeSnapshot({
      recent_offers: [makeOffer({ id: 'oferta-nueva', status: 'winning' }), makeOffer({ id: 'oferta-vieja', status: 'winning' })],
    });

    const result = applyDomainEventToSnapshot(
      snapshot,
      {
        event_type: 'oferta.winner_changed',
        event_id: 'e1',
        remate_id: 'remate-1',
        occurred_at: 't',
        lote_id: 'lote-1',
        previous_oferta_id: 'oferta-vieja',
        previous_buyer_id: 'x',
        new_oferta_id: 'oferta-nueva',
        new_buyer_id: 'y',
        new_amount: '2000.00',
      },
      [],
    );

    expect(result.recent_offers.find((o) => o.id === 'oferta-vieja')?.status).toBe('outbid');
    expect(result.recent_offers.find((o) => o.id === 'oferta-nueva')?.status).toBe('winning');
  });

  it('oferta.placed y oferta.rejected no modifican el snapshot', () => {
    const snapshot = makeSnapshot();

    const afterPlaced = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'oferta.placed', event_id: 'e1', remate_id: 'remate-1', occurred_at: 't', oferta_id: 'o1', lote_id: 'l1', buyer_id: 'x', amount: '1', status: 'accepted' },
      [],
    );
    expect(afterPlaced).toBe(snapshot);

    const afterRejected = applyDomainEventToSnapshot(
      snapshot,
      { event_type: 'oferta.rejected', event_id: 'e2', remate_id: 'remate-1', occurred_at: 't', oferta_id: 'o2', lote_id: 'l1', buyer_id: 'x', amount: '1', reason: 'monto insuficiente' },
      [],
    );
    expect(afterRejected).toBe(snapshot);
  });
});

describe('applyDomainEventToLotes', () => {
  it('lote.opened marca el lote como "open"', () => {
    const lotes = [makeLote({ id: 'lote-2', status: 'pending' })];
    const result = applyDomainEventToLotes(lotes, {
      event_type: 'lote.opened',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-2',
      lot_number: '2',
      display_order: 1,
    });
    expect(result[0].status).toBe('open');
    expect(result).not.toBe(lotes);
  });

  it('lote.closed marca "closed_sold"/"closed_unsold" según outcome, con final_price', () => {
    const lotes = [makeLote({ id: 'lote-1', status: 'open' })];
    const sold = applyDomainEventToLotes(lotes, {
      event_type: 'lote.closed',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-1',
      outcome: 'sold',
      final_price: '1500.00',
    });
    expect(sold[0].status).toBe('closed_sold');
    expect(sold[0].final_price).toBe('1500.00');

    const unsold = applyDomainEventToLotes(lotes, {
      event_type: 'lote.closed',
      event_id: 'e2',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-1',
      outcome: 'unsold',
      final_price: null,
    });
    expect(unsold[0].status).toBe('closed_unsold');
  });

  it('lote.cancelled marca "cancelled"', () => {
    const lotes = [makeLote({ id: 'lote-1', status: 'pending' })];
    const result = applyDomainEventToLotes(lotes, {
      event_type: 'lote.cancelled',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-1',
      reason: 'Retirado por el rematador',
    });
    expect(result[0].status).toBe('cancelled');
  });

  it('no toca lotes no afectados -- misma referencia de objeto para preservar React.memo', () => {
    const untouched = makeLote({ id: 'lote-otro' });
    const lotes = [makeLote({ id: 'lote-1', status: 'pending' }), untouched];

    const result = applyDomainEventToLotes(lotes, {
      event_type: 'lote.opened',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
      lote_id: 'lote-1',
      lot_number: '1',
      display_order: 0,
    });

    expect(result[1]).toBe(untouched);
  });

  it('eventos no relacionados a lotes devuelven la misma referencia', () => {
    const lotes = [makeLote()];
    const result = applyDomainEventToLotes(lotes, {
      event_type: 'remate.started',
      event_id: 'e1',
      remate_id: 'remate-1',
      occurred_at: 't',
    });
    expect(result).toBe(lotes);
  });
});
