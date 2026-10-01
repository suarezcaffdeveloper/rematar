import { describe, expect, it } from 'vitest';
import {
  groupOf,
  isInProgress,
  latestEvent,
  matchesComprasSearch,
  pickFocus,
  recentEvents,
  sortInProgress,
  timeAgo,
} from './comprasUtils';
import type { PostAuctionCase, PostAuctionStatus } from './types';

function makeCompra(overrides: Partial<PostAuctionCase> & { id: string }): PostAuctionCase {
  return {
    lote_id: 'lote',
    lot_number: '1',
    lote_title: 'Lote',
    lote_cover_image_url: null,
    remate_id: 'remate',
    remate_title: 'Remate',
    buyer_id: 'buyer',
    buyer_name: null,
    rematador_id: 'empresa',
    rematador_name: null,
    base_price: '100',
    final_price: '150',
    status: 'adjudicado',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('groupOf', () => {
  it('agrupa los ocho estados en las cuatro etapas', () => {
    const expected: Record<PostAuctionStatus, string> = {
      adjudicado: 'coordinar',
      pendiente_contacto: 'coordinar',
      pago_pendiente: 'pagar',
      pago_recibido: 'camino',
      preparando_entrega: 'camino',
      enviado: 'camino',
      entregado: 'recibidas',
      finalizado: 'recibidas',
    };
    for (const [status, group] of Object.entries(expected)) {
      expect(groupOf(status as PostAuctionStatus)).toBe(group);
    }
  });
});

describe('isInProgress', () => {
  it('es falso solo para entregado y finalizado', () => {
    expect(isInProgress({ status: 'enviado' })).toBe(true);
    expect(isInProgress({ status: 'entregado' })).toBe(false);
    expect(isInProgress({ status: 'finalizado' })).toBe(false);
  });
});

describe('pickFocus', () => {
  it('prioriza la que espera el pago, aunque haya otra más antigua esperando contacto', () => {
    const compras = [
      makeCompra({ id: 'contacto', status: 'pendiente_contacto', created_at: '2026-08-01T00:00:00Z' }),
      makeCompra({ id: 'pago', status: 'pago_pendiente', created_at: '2026-09-10T00:00:00Z' }),
    ];
    expect(pickFocus(compras)?.id).toBe('pago');
  });

  it('entre dos que esperan lo mismo, elige la que hace más tiempo que espera', () => {
    const compras = [
      makeCompra({ id: 'nueva', status: 'pago_pendiente', created_at: '2026-09-10T00:00:00Z' }),
      makeCompra({ id: 'vieja', status: 'pago_pendiente', created_at: '2026-09-01T00:00:00Z' }),
    ];
    expect(pickFocus(compras)?.id).toBe('vieja');
  });

  it('devuelve null si todo está en camino o recibido', () => {
    expect(pickFocus([makeCompra({ id: 'a', status: 'enviado' }), makeCompra({ id: 'b', status: 'entregado' })])).toBeNull();
    expect(pickFocus([])).toBeNull();
  });
});

describe('sortInProgress', () => {
  it('excluye lo recibido y pone primero lo que espera el pago, después lo más reciente', () => {
    const compras = [
      makeCompra({ id: 'vieja', status: 'enviado', created_at: '2026-09-01T00:00:00Z' }),
      makeCompra({ id: 'hecha', status: 'finalizado' }),
      makeCompra({ id: 'nueva', status: 'preparando_entrega', created_at: '2026-09-20T00:00:00Z' }),
      makeCompra({ id: 'pago', status: 'pago_pendiente', created_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(sortInProgress(compras).map((c) => c.id)).toEqual(['pago', 'nueva', 'vieja']);
  });
});

describe('latestEvent / recentEvents', () => {
  it('toma el hito con la fecha más reciente', () => {
    const compra = makeCompra({
      id: 'a',
      created_at: '2026-09-01T00:00:00Z',
      contacted_at: '2026-09-02T00:00:00Z',
      payment_at: '2026-09-05T00:00:00Z',
      shipped_at: '2026-09-08T00:00:00Z',
    });
    const event = latestEvent(compra);
    expect(event.text).toBe('Fue enviada');
    expect(event.at).toBe('2026-09-08T00:00:00Z');
  });

  it('sin ningún hito posterior, es la adjudicación', () => {
    expect(latestEvent(makeCompra({ id: 'a' })).text).toBe('Te la adjudicaron');
  });

  it('ordena las novedades de la más nueva a la más vieja y respeta el límite', () => {
    const compras = [
      makeCompra({ id: 'a', created_at: '2026-09-01T00:00:00Z' }),
      makeCompra({ id: 'b', created_at: '2026-09-03T00:00:00Z' }),
      makeCompra({ id: 'c', created_at: '2026-09-02T00:00:00Z' }),
    ];
    expect(recentEvents(compras, 2).map((e) => e.compra.id)).toEqual(['b', 'c']);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-09-30T12:00:00Z').getTime();

  it('expresa días, semanas y meses en español', () => {
    expect(timeAgo('2026-09-30T08:00:00Z', now)).toBe('hoy');
    expect(timeAgo('2026-09-29T12:00:00Z', now)).toBe('ayer');
    expect(timeAgo('2026-09-27T12:00:00Z', now)).toBe('hace 3 días');
    expect(timeAgo('2026-09-16T12:00:00Z', now)).toBe('hace 2 semanas');
    expect(timeAgo('2026-06-30T12:00:00Z', now)).toBe('hace 3 meses');
  });

  it('una fecha futura (reloj desfasado) se trata como hoy, no como "dentro de"', () => {
    expect(timeAgo('2026-10-05T12:00:00Z', now)).toBe('hoy');
  });
});

describe('matchesComprasSearch', () => {
  const compra = makeCompra({ id: 'a', lote_title: 'Toyota Hilux', remate_title: 'Flota corporativa', lot_number: '7' });

  it('busca por título del lote, del remate o número de lote, sin distinguir mayúsculas', () => {
    expect(matchesComprasSearch(compra, 'hilux')).toBe(true);
    expect(matchesComprasSearch(compra, 'FLOTA')).toBe(true);
    expect(matchesComprasSearch(compra, '7')).toBe(true);
    expect(matchesComprasSearch(compra, 'tractor')).toBe(false);
    expect(matchesComprasSearch(compra, '   ')).toBe(true);
  });
});
