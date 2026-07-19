import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOTE_FORM_VALUES,
  buildLoteFormPayload,
  loteToFormValues,
  validateLoteForm,
  type LoteFormValues,
} from './loteForm';
import type { Lote } from '../remates/types';

function makeValues(overrides: Partial<LoteFormValues> = {}): LoteFormValues {
  return {
    ...DEFAULT_LOTE_FORM_VALUES,
    lot_number: '1',
    title: 'Toro Angus',
    category: 'hacienda',
    base_price: '1000.00',
    min_increment: '50.00',
    ...overrides,
  };
}

describe('validateLoteForm', () => {
  it('valores válidos, sin errores', () => {
    expect(validateLoteForm(makeValues())).toEqual({});
  });

  it('número de lote vacío o demasiado largo', () => {
    expect(validateLoteForm(makeValues({ lot_number: '' }))).toHaveProperty('lot_number');
    expect(validateLoteForm(makeValues({ lot_number: 'a'.repeat(21) }))).toHaveProperty('lot_number');
  });

  it('nombre muy corto', () => {
    expect(validateLoteForm(makeValues({ title: 'ab' }))).toHaveProperty('title');
  });

  it('sin categoría', () => {
    expect(validateLoteForm(makeValues({ category: '' }))).toHaveProperty('category');
  });

  it('peso inválido (no numérico o negativo)', () => {
    expect(validateLoteForm(makeValues({ peso_kg: 'pesado' }))).toHaveProperty('peso_kg');
    expect(validateLoteForm(makeValues({ peso_kg: '-5' }))).toHaveProperty('peso_kg');
  });

  it('peso vacío es válido (opcional)', () => {
    expect(validateLoteForm(makeValues({ peso_kg: '' })).peso_kg).toBeUndefined();
  });

  it('cantidad no entera o menor a 1', () => {
    expect(validateLoteForm(makeValues({ quantity: '0' }))).toHaveProperty('quantity');
    expect(validateLoteForm(makeValues({ quantity: '1.5' }))).toHaveProperty('quantity');
  });

  it('precio inicial / incremento mínimo inválidos', () => {
    expect(validateLoteForm(makeValues({ base_price: '0' }))).toHaveProperty('base_price');
    expect(validateLoteForm(makeValues({ base_price: 'no-numero' }))).toHaveProperty('base_price');
    expect(validateLoteForm(makeValues({ min_increment: '0' }))).toHaveProperty('min_increment');
  });

  it('precio de reserva menor al precio inicial', () => {
    const result = validateLoteForm(makeValues({ base_price: '1000.00', reserve_price: '500.00' }));
    expect(result).toHaveProperty('reserve_price');
  });

  it('precio de reserva vacío es válido (opcional)', () => {
    expect(validateLoteForm(makeValues({ reserve_price: '' })).reserve_price).toBeUndefined();
  });

  it('atributos con claves repetidas', () => {
    const result = validateLoteForm(
      makeValues({
        attributeRows: [
          { key: 'raza', value: 'Angus' },
          { key: 'RAZA', value: 'Hereford' },
        ],
      }),
    );
    expect(result).toHaveProperty('attributes');
  });

  it('más de 30 atributos (contando peso)', () => {
    const attributeRows = Array.from({ length: 30 }, (_, i) => ({ key: `attr${i}`, value: 'x' }));
    const result = validateLoteForm(makeValues({ peso_kg: '480', attributeRows }));
    expect(result).toHaveProperty('attributes');
  });
});

describe('buildLoteFormPayload', () => {
  it('mapea peso_kg como número dentro de attributes', () => {
    const payload = buildLoteFormPayload(makeValues({ peso_kg: '480' }));
    expect(payload.attributes?.peso_kg).toBe(480);
  });

  it('mapea filas de atributos genéricos, coercionando números', () => {
    const payload = buildLoteFormPayload(
      makeValues({ attributeRows: [{ key: 'raza', value: 'Angus' }, { key: 'edad_meses', value: '18' }] }),
    );
    expect(payload.attributes?.raza).toBe('Angus');
    expect(payload.attributes?.edad_meses).toBe(18);
  });

  it('no incluye "images" en el payload (se gestiona aparte, Épica 6, Módulo 6.1)', () => {
    const payload = buildLoteFormPayload(makeValues());
    expect(payload.images).toBeUndefined();
  });

  it('reserve_price vacío se manda como null', () => {
    const payload = buildLoteFormPayload(makeValues({ reserve_price: '' }));
    expect(payload.reserve_price).toBeNull();
  });

  it('quantity se convierte a número', () => {
    const payload = buildLoteFormPayload(makeValues({ quantity: '5' }));
    expect(payload.quantity).toBe(5);
  });
});

describe('loteToFormValues', () => {
  it('separa peso_kg del resto de los atributos', () => {
    const lote: Lote = {
      id: 'l1',
      remate_id: 'r1',
      lot_number: '3',
      display_order: 2,
      title: 'Toro Angus',
      description: 'Descripción',
      category: 'hacienda',
      attributes: { peso_kg: 480, raza: 'Angus' },
      images: [{ url: 'https://example.com/a.jpg', order: 0, caption: null }],
      quantity: 1,
      unit_label: null,
      base_price: '1000.00',
      min_increment: '50.00',
      reserve_price: null,
      final_price: null,
      status: 'pending',
      created_at: '2026-07-01T00:00:00Z',
    };

    const values = loteToFormValues(lote);

    expect(values.peso_kg).toBe('480');
    expect(values.attributeRows).toEqual([{ key: 'raza', value: 'Angus' }]);
  });
});
