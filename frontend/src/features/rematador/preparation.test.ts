import { describe, expect, it } from 'vitest';
import {
  buildPreparation,
  buildPreparationHeadline,
  computeCatalogNumbers,
  describeDateProblem,
  filterLotes,
  suggestIncrement,
} from './preparation';
import { suggestNextLotNumber, validateLoteForm, DEFAULT_LOTE_FORM_VALUES } from './loteForm';
import type { Lote, Remate } from '../remates/types';

const NOW = new Date('2026-10-01T10:00:00Z').getTime();
const future = (hours: number) => new Date(NOW + hours * 3600 * 1000).toISOString();

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'r1',
    owner_id: 'o',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: future(24 * 9),
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

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'l1',
    remate_id: 'r1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [{ url: 'a.jpg', order: 0, caption: null }],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('describeDateProblem', () => {
  it('pide la fecha de inicio, y en Timed también la de cierre', () => {
    expect(describeDateProblem(makeRemate({ starts_at: null }), NOW)).toBe('Definí la fecha de inicio para publicar.');
    expect(describeDateProblem(makeRemate({ starts_at: null, auction_type: 'timed' }), NOW)).toBe(
      'Definí las fechas de inicio y cierre para publicar.',
    );
  });

  it('avisa cuando la fecha de inicio ya pasó, antes de que lo rechace el backend', () => {
    expect(describeDateProblem(makeRemate({ starts_at: future(-2) }), NOW)).toMatch(/ya pasó/);
  });

  it('en Timed exige un cierre posterior al inicio', () => {
    const timed = makeRemate({ auction_type: 'timed', starts_at: future(10) });
    expect(describeDateProblem(timed, NOW)).toMatch(/necesita fecha de cierre/);
    expect(describeDateProblem({ ...timed, ends_at: future(5) }, NOW)).toMatch(/posterior/);
    expect(describeDateProblem({ ...timed, ends_at: future(48) }, NOW)).toBeNull();
  });
});

describe('buildPreparation', () => {
  it('un borrador con fecha y lotes se puede publicar', () => {
    const prep = buildPreparation(makeRemate(), [makeLote()], NOW);
    expect(prep.canPublish).toBe(true);
    expect(prep.blockers).toEqual([]);
    expect(prep.blockedReason).toBeUndefined();
  });

  it('sin lotes no se puede publicar y dice por qué (mismo texto de siempre)', () => {
    const prep = buildPreparation(makeRemate(), [], NOW);
    expect(prep.canPublish).toBe(false);
    expect(prep.blockedReason).toBe('Debés cargar al menos un lote para publicar el remate.');
    expect(prep.items.find((i) => i.key === 'lotes')?.action).toMatchObject({ type: 'add-lote' });
  });

  it('suma todo lo que falta cuando hay más de un bloqueo', () => {
    const prep = buildPreparation(makeRemate({ starts_at: null }), [], NOW);
    expect(prep.blockers.map((b) => b.key)).toEqual(['fecha', 'lotes']);
    expect(prep.blockedReason).toContain('Definí la fecha de inicio');
    expect(prep.blockedReason).toContain('al menos un lote');
  });

  it('los lotes sin foto son solo una recomendación: no impiden publicar', () => {
    const prep = buildPreparation(makeRemate(), [makeLote(), makeLote({ id: 'l2', images: [] })], NOW);
    const photos = prep.items.find((i) => i.key === 'fotos');
    expect(photos).toMatchObject({ state: 'recommended', action: { type: 'show-without-photo' } });
    expect(photos?.detail).toContain('1 lote sin foto');
    expect(prep.canPublish).toBe(true);
  });

  it('muestra la garantía y, solo en vivo, el aviso de rematador y video', () => {
    const live = buildPreparation(
      makeRemate({ settings: { ...makeRemate().settings, guarantee_required: true, guarantee_amount: '500000' } }),
      [makeLote()],
      NOW,
    );
    expect(live.items.find((i) => i.key === 'garantia')?.detail).toMatch(/Pide .*500\.000/);
    expect(live.items.some((i) => i.key === 'operador')).toBe(true);

    const timed = buildPreparation(makeRemate({ auction_type: 'timed', ends_at: future(24 * 12) }), [makeLote()], NOW);
    expect(timed.items.some((i) => i.key === 'operador')).toBe(false);
    expect(timed.items.find((i) => i.key === 'garantia')?.detail).toBe('No pide garantía');
  });

  it('fuera de borrador nunca se puede publicar', () => {
    expect(buildPreparation(makeRemate({ status: 'scheduled' }), [makeLote()], NOW).canPublish).toBe(false);
  });
});

describe('buildPreparationHeadline', () => {
  it('resume en una frase cuánto falta', () => {
    const draft = makeRemate();
    expect(buildPreparationHeadline(draft, 0, true)).toBe('Tu remate está listo para publicar.');
    expect(buildPreparationHeadline(draft, 1, false)).toBe('Te falta 1 cosa para publicar.');
    expect(buildPreparationHeadline(draft, 2, false)).toBe('Te faltan 2 cosas para publicar.');
    expect(buildPreparationHeadline(makeRemate({ status: 'scheduled' }), 0, false)).toBe('Tu remate está publicado.');
    expect(buildPreparationHeadline(makeRemate({ status: 'live' }), 0, false)).toBe('Los lotes de tu remate.');
  });
});

describe('catálogo', () => {
  const lotes = [
    makeLote({ id: 'a', lot_number: '1', title: 'Novillos', base_price: '1000.00', reserve_price: '1200.00' }),
    makeLote({ id: 'b', lot_number: '2', title: 'Vaquillonas', base_price: '2500.50', images: [] }),
  ];

  it('computeCatalogNumbers suma los precios base y cuenta fotos y reservas', () => {
    expect(computeCatalogNumbers(lotes)).toEqual({ count: 2, totalBase: 3500.5, withPhoto: 1, withoutPhoto: 1, withReserve: 1 });
  });

  it('filterLotes filtra por foto, reserva y busca por nombre o número', () => {
    expect(filterLotes(lotes, 'without-photo', '').map((l) => l.id)).toEqual(['b']);
    expect(filterLotes(lotes, 'with-reserve', '').map((l) => l.id)).toEqual(['a']);
    expect(filterLotes(lotes, 'all', 'vaqui').map((l) => l.id)).toEqual(['b']);
    expect(filterLotes(lotes, 'all', '1').map((l) => l.id)).toEqual(['a']);
  });

  it('suggestIncrement redondea a un número lindo y no sugiere sin precio base', () => {
    expect(suggestIncrement('9600000', 1)).toBe('96000');
    expect(suggestIncrement('20000000', 1)).toBe('200000');
    expect(suggestIncrement('50000', 1)).toBe('500');
    expect(suggestIncrement('', 1)).toBeNull();
    expect(suggestIncrement('0', 2)).toBeNull();
  });
});

describe('número de lote', () => {
  it('suggestNextLotNumber toma el mayor entero + 1 e cuenta el prefijo numérico de las copias e ignora los que no tienen', () => {
    expect(suggestNextLotNumber([])).toBe('1');
    expect(suggestNextLotNumber(['1', '2', '14'])).toBe('15');
    expect(suggestNextLotNumber(['3-copia'])).toBe('4');
    expect(suggestNextLotNumber(['A'])).toBe('1');
  });

  it('validateLoteForm avisa de un número repetido (sin distinguir mayúsculas)', () => {
    const values = { ...DEFAULT_LOTE_FORM_VALUES, lot_number: ' 7a ', title: 'Toro', category: 'hacienda' as const, base_price: '10', min_increment: '1' };
    expect(validateLoteForm(values, ['7A']).lot_number).toBe('Ya existe un lote 7a. Elegí otro número.');
    expect(validateLoteForm(values, ['8']).lot_number).toBeUndefined();
    expect(validateLoteForm(values).lot_number).toBeUndefined();
  });
});
