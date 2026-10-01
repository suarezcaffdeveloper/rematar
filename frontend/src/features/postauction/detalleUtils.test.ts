import { describe, expect, it } from 'vitest';
import { getResponsables, groupTimelineByStep, stepDate } from './detalleUtils';
import type { PostAuctionCaseDetail, TimelineEntry } from './types';

function entry(overrides: Partial<TimelineEntry> & { id: string; occurred_at: string }): TimelineEntry {
  return {
    actor_id: null,
    actor_name: null,
    actor_role: null,
    action: 'status_changed',
    previous_status: null,
    new_status: null,
    note: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PostAuctionCaseDetail> = {}): PostAuctionCaseDetail {
  return {
    id: 'c1',
    lote_id: 'l1',
    lot_number: '1',
    lote_title: 'Lote',
    lote_cover_image_url: null,
    remate_id: 'r1',
    remate_title: 'Remate',
    buyer_id: 'b1',
    buyer_name: null,
    rematador_id: 'e1',
    rematador_name: 'Casa Belgrano',
    base_price: '100',
    final_price: '150',
    status: 'pago_pendiente',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    timeline: [],
    documents: [],
    ...overrides,
  };
}

describe('groupTimelineByStep', () => {
  const timeline = [
    entry({ id: '3', occurred_at: '2026-09-05T10:00:00Z', action: 'note_added', note: 'Pasame el comprobante' }),
    entry({ id: '1', occurred_at: '2026-09-01T10:00:00Z', action: 'case_created', new_status: 'adjudicado' }),
    entry({ id: '2', occurred_at: '2026-09-03T10:00:00Z', new_status: 'pago_pendiente', previous_status: 'adjudicado' }),
  ];

  it('cuelga cada entrada del paso vigente cuando ocurrió, en orden cronológico', () => {
    const groups = groupTimelineByStep(timeline);
    expect(groups.adjudicado.map((e) => e.id)).toEqual(['1']);
    // El cambio de estado pertenece al paso al que entró; la observación posterior, a ese mismo paso.
    expect(groups.pago_pendiente.map((e) => e.id)).toEqual(['2', '3']);
    expect(groups.enviado).toEqual([]);
  });

  it('descarta las notificaciones fallidas, que el comprador no debe ver', () => {
    const groups = groupTimelineByStep([
      ...timeline,
      entry({ id: '9', occurred_at: '2026-09-04T10:00:00Z', action: 'notification_failed' }),
    ]);
    expect(Object.values(groups).flat().some((e) => e.action === 'notification_failed')).toBe(false);
  });

  it('no rompe con un historial vacío', () => {
    expect(Object.values(groupTimelineByStep([])).every((entries) => entries.length === 0)).toBe(true);
  });
});

describe('stepDate', () => {
  it('toma la fecha del cambio de estado en el historial', () => {
    const detail = makeDetail({
      timeline: [entry({ id: '2', occurred_at: '2026-09-03T10:00:00Z', new_status: 'pago_pendiente' })],
    });
    expect(stepDate(detail, 'pago_pendiente')).toBe('2026-09-03T10:00:00Z');
  });

  it('sin historial, cae al campo de hito del caso', () => {
    const detail = makeDetail({ shipped_at: '2026-09-09T10:00:00Z' });
    expect(stepDate(detail, 'enviado')).toBe('2026-09-09T10:00:00Z');
    expect(stepDate(detail, 'adjudicado')).toBe('2026-09-01T10:00:00Z');
  });

  it('un paso sin fecha conocida devuelve null', () => {
    expect(stepDate(makeDetail(), 'entregado')).toBeNull();
    expect(stepDate(makeDetail(), 'pago_pendiente')).toBeNull();
  });
});

describe('getResponsables', () => {
  it('muestra martillero y empresa cuando son distintos', () => {
    const r = getResponsables(makeDetail({ operador_name: 'Lucía', empresa_name: 'Agro Subastas' }));
    expect(r).toEqual({ martillero: 'Lucía', empresa: 'Agro Subastas' });
  });

  it('si la empresa operó ella misma, una sola fila', () => {
    const r = getResponsables(makeDetail({ operador_name: 'Agro Subastas', empresa_name: 'Agro Subastas' }));
    expect(r).toEqual({ martillero: 'Agro Subastas', empresa: null });
  });

  it('sin operador, usa la empresa y, en última instancia, el nombre del rematador', () => {
    expect(getResponsables(makeDetail({ empresa_name: 'Agro' })).martillero).toBe('Agro');
    expect(getResponsables(makeDetail()).martillero).toBe('Casa Belgrano');
  });
});
