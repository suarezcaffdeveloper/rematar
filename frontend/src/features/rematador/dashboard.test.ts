import { describe, expect, it } from 'vitest';
import {
  buildHeadline,
  buildPendingTasks,
  computeMonthlyResults,
  describeNextStep,
  describeTimeUntil,
  lifecycleStageIndex,
  matchesStatusFilter,
  sortForDashboard,
} from './dashboard';
import type { Remate } from '../remates/types';

const NOW = new Date('2026-10-01T10:00:00Z').getTime();
const HOUR = 3600 * 1000;

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'r1',
    owner_id: 'owner',
    title: 'Remate',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: new Date(NOW + 5 * 24 * HOUR).toISOString(),
    ends_at: null,
    status: 'draft',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const at = (hours: number) => new Date(NOW + hours * HOUR).toISOString();

describe('describeTimeUntil', () => {
  it('formatea minutos, horas y días hacia el futuro y el pasado', () => {
    expect(describeTimeUntil(at(0.5), NOW)).toBe('en 30 min');
    expect(describeTimeUntil(at(18), NOW)).toBe('en 18 h');
    expect(describeTimeUntil(at(24), NOW)).toBe('en 1 día');
    expect(describeTimeUntil(at(48 + 4), NOW)).toBe('en 2 días');
    expect(describeTimeUntil(at(-40 / 60), NOW)).toBe('hace 40 min');
  });
});

describe('buildPendingTasks', () => {
  it('un remate en vivo programado sin operador que empieza en menos de 48 h es urgente', () => {
    const tasks = buildPendingTasks([makeRemate({ status: 'scheduled', starts_at: at(18), rematador_id: null })], NOW, null);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ severity: 'urgent', actionLabel: 'Generar código', to: '/remates/r1/gestionar' });
  });

  it('con el código ya generado y sin operador, baja de urgente: pendiente, y atención a 1 h del inicio', () => {
    const generated = new Date(NOW - 5 * 60_000).toISOString();
    const far = buildPendingTasks([makeRemate({ status: 'scheduled', starts_at: at(18), operator_code_generated_at: generated })], NOW, null);
    expect(far[0]).toMatchObject({ severity: 'todo', actionLabel: 'Ver código', operatorCodeRemateId: 'r1' });
    expect(far[0].title).toContain('Esperando al martillero');

    const soon = buildPendingTasks([makeRemate({ status: 'scheduled', starts_at: at(0.5), operator_code_generated_at: generated })], NOW, null);
    expect(soon[0]).toMatchObject({ severity: 'warn', actionLabel: 'Ver código' });
    expect(soon[0].title).toContain('todavía no entró');
  });

  it('no avisa del operador si el remate es Timed, ya tiene operador o falta mucho', () => {
    const timed = makeRemate({ id: 't', status: 'scheduled', auction_type: 'timed', starts_at: at(10) });
    const withOperator = makeRemate({ id: 'o', status: 'scheduled', starts_at: at(10), rematador_id: 'op' });
    const far = makeRemate({ id: 'f', status: 'scheduled', starts_at: at(24 * 10), rematador_id: null });

    expect(buildPendingTasks([timed, withOperator, far], NOW, null)).toEqual([]);
  });

  it('un remate pausado es una tarea de atención', () => {
    const tasks = buildPendingTasks([makeRemate({ status: 'paused' })], NOW, null);
    expect(tasks[0]).toMatchObject({ severity: 'warn', title: '“Remate” está pausado' });
  });

  it('un borrador sin fecha pide definirla; con fecha, terminar de prepararlo', () => {
    const noDate = buildPendingTasks([makeRemate({ status: 'draft', starts_at: null })], NOW, null);
    const withDate = buildPendingTasks([makeRemate({ status: 'draft' })], NOW, null);

    expect(noDate[0]).toMatchObject({ severity: 'todo', actionLabel: 'Definir fecha' });
    expect(withDate[0]).toMatchObject({ severity: 'todo', actionLabel: 'Preparar lotes' });
  });

  it('un Timed que cierra en menos de 3 días genera un aviso; uno que cierra más tarde, no', () => {
    const soon = makeRemate({ id: 'a', status: 'live', auction_type: 'timed', ends_at: at(50) });
    const later = makeRemate({ id: 'b', status: 'live', auction_type: 'timed', ends_at: at(24 * 10) });

    const tasks = buildPendingTasks([soon, later], NOW, null);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ severity: 'info', id: 'closing-a' });
  });

  it('suma las ventas sin cobrar y ordena por urgencia', () => {
    const tasks = buildPendingTasks(
      [
        makeRemate({ id: 'd', status: 'draft' }),
        makeRemate({ id: 's', status: 'scheduled', starts_at: at(5), rematador_id: null }),
      ],
      NOW,
      { count: 3, amountLabel: '$ 27,4 M' },
    );

    expect(tasks.map((task) => task.severity)).toEqual(['urgent', 'warn', 'todo']);
    expect(tasks[1].title).toBe('3 ventas esperan el pago');
  });

  it('con una sola venta, el título va en singular', () => {
    const [task] = buildPendingTasks([], NOW, { count: 1, amountLabel: '$ 100' });
    expect(task.title).toBe('1 venta espera el pago');
  });
});

describe('describeNextStep', () => {
  const ctx = { loteCount: 3, now: NOW };

  it('draft: sin lotes pide cargarlos; sin fecha, definirla; listo, publicar', () => {
    expect(describeNextStep(makeRemate({ status: 'draft' }), { ...ctx, loteCount: 0 })).toMatchObject({ actionLabel: 'Cargar lotes', action: 'navigate' });
    expect(describeNextStep(makeRemate({ status: 'draft', starts_at: null }), ctx)).toMatchObject({ actionLabel: 'Preparar remate' });
    expect(describeNextStep(makeRemate({ status: 'draft' }), ctx)).toMatchObject({ actionLabel: 'Publicar remate', action: 'publish' });
  });

  it('scheduled Timed: arranca solo, no se inicia a mano', () => {
    const step = describeNextStep(makeRemate({ status: 'scheduled', auction_type: 'timed', starts_at: at(48) }), ctx);
    expect(step.text).toBe('Arranca solo en 2 días. No hace falta iniciarlo.');
    expect(step.action).toBe('navigate');
  });

  it('scheduled en vivo: sin operador es urgente; con operador se puede iniciar (salvo sin lotes)', () => {
    expect(describeNextStep(makeRemate({ status: 'scheduled', starts_at: at(18) }), ctx)).toMatchObject({
      tone: 'urgent',
      actionLabel: 'Generar código',
    });
    const withOperator = makeRemate({ status: 'scheduled', starts_at: at(18), rematador_id: 'op' });
    expect(describeNextStep(withOperator, ctx)).toMatchObject({ action: 'start', blockedReason: undefined });
    expect(describeNextStep(withOperator, { ...ctx, loteCount: 0 }).blockedReason).toBe(
      'Cargá al menos un lote antes de iniciar el remate.',
    );
  });

  it('scheduled en vivo con código generado y sin operador: espera al martillero y abre el panel del código', () => {
    const generated = new Date(NOW - 60_000).toISOString();
    const step = describeNextStep(makeRemate({ status: 'scheduled', starts_at: at(18), operator_code_generated_at: generated }), ctx);
    expect(step).toMatchObject({ tone: 'default', actionLabel: 'Ver código', action: 'operator-code' });
    expect(step.text).toContain('Esperando que el martillero');
    const soon = describeNextStep(makeRemate({ status: 'scheduled', starts_at: at(0.5), operator_code_generated_at: generated }), ctx);
    expect(soon.tone).toBe('warn');
  });

  it('paused, finished y cancelled', () => {
    expect(describeNextStep(makeRemate({ status: 'paused' }), ctx)).toMatchObject({ tone: 'warn', actionLabel: 'Ver consola' });
    expect(describeNextStep(makeRemate({ status: 'finished' }), ctx).to).toBe('/remates/r1/historial');
    expect(describeNextStep(makeRemate({ status: 'cancelled', cancellation_reason: 'Cambio de fecha' }), ctx).text).toBe(
      'Cancelado. Motivo: Cambio de fecha.',
    );
  });
});

describe('estados y orden', () => {
  it('lifecycleStageIndex agrupa pausado con en curso y cancelado con borrador', () => {
    expect(['draft', 'scheduled', 'live', 'paused', 'finished', 'cancelled'].map((s) => lifecycleStageIndex(s as Remate['status']))).toEqual([
      0, 1, 2, 2, 3, 0,
    ]);
  });

  it('matchesStatusFilter agrupa los estados como los filtros del panel', () => {
    expect(matchesStatusFilter('paused', 'running')).toBe(true);
    expect(matchesStatusFilter('cancelled', 'closed')).toBe(true);
    expect(matchesStatusFilter('draft', 'scheduled')).toBe(false);
    expect(matchesStatusFilter('finished', 'all')).toBe(true);
  });

  it('sortForDashboard: corriendo, programado, borrador y cerrado (el más reciente primero)', () => {
    const sorted = sortForDashboard([
      makeRemate({ id: 'old', status: 'finished', starts_at: at(-24 * 20) }),
      makeRemate({ id: 'draft', status: 'draft' }),
      makeRemate({ id: 'recent', status: 'finished', starts_at: at(-24 * 2) }),
      makeRemate({ id: 'sched', status: 'scheduled' }),
      makeRemate({ id: 'live', status: 'live' }),
    ]);
    expect(sorted.map((remate) => remate.id)).toEqual(['live', 'sched', 'draft', 'recent', 'old']);
  });

  it('buildHeadline resume remates en curso y tareas', () => {
    const running = makeRemate({ status: 'live' });
    expect(buildHeadline([], 0)).toBe('Armá tu primer remate.');
    expect(buildHeadline([running], 0)).toBe('Tenés 1 remate en curso. Todo al día.');
    expect(buildHeadline([running, makeRemate({ id: 'p', status: 'paused' })], 7)).toBe(
      'Tenés 2 remates en curso y 7 cosas para resolver.',
    );
    expect(buildHeadline([makeRemate()], 1)).toBe('No tenés remates en curso y 1 cosa para resolver.');
  });
});

describe('computeMonthlyResults', () => {
  const finished = (id: string, daysAgo: number, value: string, sold = 5, total = 10) => ({
    id,
    status: 'finished' as const,
    resolved_at: new Date(NOW - daysAgo * 24 * HOUR).toISOString(),
    lote_count: total,
    lotes_sold_count: sold,
    total_awarded_value: value,
  });

  it('suma solo los cerrados de los últimos 30 días', () => {
    const results = computeMonthlyResults(
      [finished('a', 5, '1000'), finished('b', 20, '2500.50', 8, 10), finished('c', 45, '9999')],
      new Map(),
      NOW,
    );
    expect(results).toMatchObject({ currency: 'ARS', revenue: 3500.5, closedRemates: 2, lotesSold: 13, lotesTotal: 20, hasOtherCurrencies: false });
  });

  it('con varias monedas muestra la de mayor recaudación y avisa, en vez de sumarlas', () => {
    const results = computeMonthlyResults(
      [finished('a', 5, '1000'), finished('b', 5, '5000')],
      new Map([['a', 'ARS'], ['b', 'USD']]),
      NOW,
    );
    expect(results).toMatchObject({ currency: 'USD', revenue: 5000, hasOtherCurrencies: true });
  });

  it('sin cerrados en el período devuelve null', () => {
    expect(computeMonthlyResults([finished('a', 60, '1000')], new Map(), NOW)).toBeNull();
    expect(computeMonthlyResults([], new Map(), NOW)).toBeNull();
  });
});
