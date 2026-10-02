import { describe, expect, it } from 'vitest';
import {
  buildSalesHeadline,
  buildSalesTasks,
  computeTotals,
  dateReached,
  daysInState,
  describeLate,
  filterSales,
  nextStatus,
  skippedStatuses,
  sortSales,
  stateSince,
} from './sales';
import type { PostAuctionCase, PostAuctionStatus, TimelineEntry } from './types';

const NOW = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function makeCase(overrides: Partial<PostAuctionCase> = {}): PostAuctionCase {
  return {
    id: 'c1',
    lote_id: 'l1',
    lot_number: '1',
    lote_title: 'Novillos Angus',
    lote_cover_image_url: null,
    remate_id: 'r1',
    remate_title: 'Remate de hacienda',
    buyer_id: 'b1',
    buyer_name: 'Estancia La Margarita',
    rematador_id: 'e1',
    rematador_name: 'Empresa',
    base_price: '1000000.00',
    final_price: '1200000.00',
    status: 'adjudicado',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: ago(10),
    updated_at: ago(10),
    ...overrides,
  };
}

const at = (status: PostAuctionStatus, days: number, overrides: Partial<PostAuctionCase> = {}) =>
  makeCase({ status, updated_at: ago(days), created_at: ago(days + 3), ...overrides });

describe('estados', () => {
  it('nextStatus y skippedStatuses siguen el orden del flujo', () => {
    expect(nextStatus('adjudicado')).toBe('pendiente_contacto');
    expect(nextStatus('finalizado')).toBeNull();
    expect(skippedStatuses('pago_pendiente', 'enviado')).toEqual(['pago_recibido', 'preparando_entrega']);
    expect(skippedStatuses('pago_pendiente', 'pago_recibido')).toEqual([]);
  });
});

describe('stateSince / daysInState', () => {
  it('con timeline usa la fecha exacta del último cambio de estado', () => {
    const timeline: TimelineEntry[] = [
      { id: '1', occurred_at: ago(9), actor_id: null, actor_name: null, actor_role: null, action: 'case_created', previous_status: null, new_status: 'adjudicado', note: null },
      { id: '2', occurred_at: ago(4), actor_id: 'x', actor_name: 'Ana', actor_role: 'empresa', action: 'status_changed', previous_status: 'adjudicado', new_status: 'pendiente_contacto', note: null },
      { id: '3', occurred_at: ago(1), actor_id: 'x', actor_name: 'Ana', actor_role: 'empresa', action: 'note_added', previous_status: null, new_status: null, note: 'hola' },
    ];
    const item = makeCase({ status: 'pendiente_contacto', updated_at: ago(0) });
    expect(stateSince(item, timeline)).toBe(new Date(ago(4)).getTime());
    expect(daysInState(item, NOW, timeline)).toBe(4);
  });

  it('sin timeline usa la fecha hito del estado y, si no hay, updated_at', () => {
    expect(daysInState(at('pago_pendiente', 1, { contacted_at: ago(6) }), NOW)).toBe(6);
    expect(daysInState(at('preparando_entrega', 4), NOW)).toBe(4);
    expect(daysInState(makeCase({ status: 'adjudicado', created_at: ago(3), updated_at: ago(0) }), NOW)).toBe(3);
  });
});

describe('describeLate', () => {
  it('marca atrasada la venta que pasó el umbral de su estado, con el motivo', () => {
    expect(describeLate(at('pago_pendiente', 6, { contacted_at: ago(6) }), NOW)).toBe('Pago pendiente hace 6 días');
    expect(describeLate(at('pago_pendiente', 5, { contacted_at: ago(5) }), NOW)).toBeNull();
    expect(describeLate(at('enviado', 9, { shipped_at: ago(9) }), NOW)).toBe('Enviada sin confirmar entrega hace 9 días');
    expect(describeLate(at('pendiente_contacto', 3), NOW)).toBe('Contacto pendiente hace 3 días');
  });

  it('una venta finalizada nunca está atrasada', () => {
    expect(describeLate(at('finalizado', 200, { finalized_at: ago(200) }), NOW)).toBeNull();
  });
});

describe('computeTotals', () => {
  const items = [
    at('pago_pendiente', 6, { id: 'a', contacted_at: ago(6), final_price: '1000.00' }),
    at('adjudicado', 0, { id: 'b', created_at: ago(0), final_price: '500.00' }),
    at('pago_recibido', 1, { id: 'c', payment_at: ago(1), final_price: '2000.00' }),
    at('enviado', 1, { id: 'd', shipped_at: ago(1), payment_at: ago(40), final_price: '3000.00' }),
    at('finalizado', 20, { id: 'e', payment_at: ago(25), finalized_at: ago(20), final_price: '4000.00' }),
  ];

  it('suma lo que falta cobrar, lo cobrado en 30 días, lo que está en camino y lo atrasado', () => {
    const totals = computeTotals(items, NOW);
    expect(totals).toMatchObject({
      unpaidCount: 2,
      unpaidSum: 1500,
      lateCount: 1,
      lateSum: 1000,
      wayCount: 2,
      waySum: 5000,
      // 'd' pagó hace 40 días: queda afuera. 'c' y 'e' sí.
      paid30Count: 2,
      paid30Sum: 6000,
    });
    expect(totals.byStage.find((s) => s.status === 'pago_pendiente')).toEqual({ status: 'pago_pendiente', count: 1, sum: 1000 });
  });
});

describe('buildSalesTasks', () => {
  it('ordena por urgencia: cobros atrasados, entregas atrasadas y después lo nuevo', () => {
    const tasks = buildSalesTasks(
      [
        at('adjudicado', 0, { id: 'new', created_at: ago(0) }),
        at('enviado', 9, { id: 'ship', shipped_at: ago(9) }),
        at('pago_pendiente', 8, { id: 'pay', contacted_at: ago(8) }),
      ],
      NOW,
    );
    expect(tasks.map((t) => t.item.id)).toEqual(['pay', 'ship', 'new']);
    expect(tasks[0]).toMatchObject({ severity: 'urgent', title: 'Estancia La Margarita todavía no pagó' });
    expect(tasks[1].severity).toBe('warn');
    expect(tasks[2]).toMatchObject({ severity: 'todo', title: 'Nueva venta: Novillos Angus' });
  });

  it('no genera tareas para ventas finalizadas ni para las que van dentro de lo normal', () => {
    expect(
      buildSalesTasks([at('finalizado', 5, { finalized_at: ago(5) }), at('pago_pendiente', 1, { contacted_at: ago(1) })], NOW),
    ).toEqual([]);
  });
});

describe('titular, filtros y orden', () => {
  it('buildSalesHeadline resume lo que hay por cobrar y las cosas pendientes', () => {
    const totals = computeTotals([at('pago_pendiente', 1, { contacted_at: ago(1), final_price: '2000000.00' })], NOW);
    expect(buildSalesHeadline(totals, 2)).toMatch(/^Tenés .*por cobrar y 2 cosas para resolver\.$/);
    expect(buildSalesHeadline(totals, 1)).toContain('y 1 cosa para resolver');
    expect(buildSalesHeadline(totals, 0)).toMatch(/Todo al día\.$/);
    expect(buildSalesHeadline(computeTotals([], NOW), 0)).toBe('No tenés cobros pendientes. Todo al día.');
  });

  it('filterSales filtra por grupo de etapas, por atrasadas y busca por lote, número o comprador', () => {
    const items = [
      at('pago_pendiente', 8, { id: 'a', contacted_at: ago(8), lote_title: 'Tractor', lot_number: '7', buyer_name: 'Cooperativa Sur' }),
      at('enviado', 1, { id: 'b', shipped_at: ago(1), lote_title: 'Novillos', lot_number: '2', buyer_name: 'Los Álamos' }),
    ];
    expect(filterSales(items, 'pago', '', NOW).map((i) => i.id)).toEqual(['a']);
    expect(filterSales(items, 'camino', '', NOW).map((i) => i.id)).toEqual(['b']);
    expect(filterSales(items, 'late', '', NOW).map((i) => i.id)).toEqual(['a']);
    expect(filterSales(items, 'all', 'alamos', NOW)).toEqual([]);
    expect(filterSales(items, 'all', 'álamos', NOW).map((i) => i.id)).toEqual(['b']);
    expect(filterSales(items, 'all', '7', NOW).map((i) => i.id)).toEqual(['a']);
  });

  it('sortSales pone primero las atrasadas, después las activas y al final las cerradas', () => {
    const sorted = sortSales(
      [
        at('finalizado', 3, { id: 'closed', finalized_at: ago(3) }),
        at('enviado', 1, { id: 'ok', shipped_at: ago(1) }),
        at('pago_pendiente', 8, { id: 'late', contacted_at: ago(8) }),
      ],
      NOW,
    );
    expect(sorted.map((i) => i.id)).toEqual(['late', 'ok', 'closed']);
  });
});

describe('dateReached', () => {
  it('devuelve la fecha del timeline, la del alta para "adjudicado" y null si el paso se salteó', () => {
    const timeline: TimelineEntry[] = [
      { id: '1', occurred_at: ago(9), actor_id: null, actor_name: null, actor_role: null, action: 'case_created', previous_status: null, new_status: 'adjudicado', note: null },
      { id: '2', occurred_at: ago(2), actor_id: 'x', actor_name: 'Ana', actor_role: 'empresa', action: 'status_changed', previous_status: 'adjudicado', new_status: 'pago_pendiente', note: null },
    ];
    expect(dateReached('pago_pendiente', timeline, ago(9))).toBe(ago(2));
    expect(dateReached('adjudicado', timeline, ago(9))).toBe(ago(9));
    expect(dateReached('pendiente_contacto', timeline, ago(9))).toBeNull();
  });
});
