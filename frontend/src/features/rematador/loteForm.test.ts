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
    title: 'Lote de prueba',
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

  it('reencolado preautorizado deshabilitado no exige precios (ADR-048)', () => {
    const result = validateLoteForm(makeValues({ requeue_preset_enabled: false }));
    expect(result.requeue_preset_base_price).toBeUndefined();
    expect(result.requeue_preset_min_increment).toBeUndefined();
  });

  it('reencolado preautorizado habilitado exige precio inicial e incremento mínimo válidos', () => {
    const result = validateLoteForm(
      makeValues({
        requeue_preset_enabled: true,
        requeue_preset_base_price: '',
        requeue_preset_min_increment: '0',
      }),
    );
    expect(result).toHaveProperty('requeue_preset_base_price');
    expect(result).toHaveProperty('requeue_preset_min_increment');
  });
});

describe('buildLoteFormPayload', () => {
  it('no incluye "attributes", "quantity" ni "unit_label" en el payload (campos sacados de la UI)', () => {
    const payload = buildLoteFormPayload(makeValues());
    expect(payload.attributes).toBeUndefined();
    expect(payload.quantity).toBeUndefined();
    expect(payload.unit_label).toBeUndefined();
  });

  it('no incluye "images" en el payload (se gestiona aparte, Épica 6, Módulo 6.1)', () => {
    const payload = buildLoteFormPayload(makeValues());
    expect(payload.images).toBeUndefined();
  });

  it('reserve_price vacío se manda como null', () => {
    const payload = buildLoteFormPayload(makeValues({ reserve_price: '' }));
    expect(payload.reserve_price).toBeNull();
  });

  it('reencolado preautorizado deshabilitado manda los precios como null (ADR-048)', () => {
    const payload = buildLoteFormPayload(
      makeValues({
        requeue_preset_enabled: false,
        requeue_preset_base_price: '1200.00',
        requeue_preset_min_increment: '100.00',
      }),
    );
    expect(payload.requeue_preset_enabled).toBe(false);
    expect(payload.requeue_preset_base_price).toBeNull();
    expect(payload.requeue_preset_min_increment).toBeNull();
  });

  it('reencolado preautorizado habilitado manda los precios cargados', () => {
    const payload = buildLoteFormPayload(
      makeValues({
        requeue_preset_enabled: true,
        requeue_preset_base_price: '1200.00',
        requeue_preset_min_increment: '100.00',
      }),
    );
    expect(payload.requeue_preset_enabled).toBe(true);
    expect(payload.requeue_preset_base_price).toBe('1200.00');
    expect(payload.requeue_preset_min_increment).toBe('100.00');
  });
});

describe('loteToFormValues', () => {
  it('mapea los campos genéricos y descarta peso/cantidad/unidad/atributos', () => {
    const lote: Lote = {
      id: 'l1',
      remate_id: 'r1',
      lot_number: '3',
      display_order: 2,
      title: 'Lote de prueba',
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
      timer_ends_at: null,
      timer_paused_remaining_seconds: null,
      timer_auto_close_enabled: true,
      round_number: 1,
      created_at: '2026-07-01T00:00:00Z',
    };

    const values = loteToFormValues(lote);

    expect(values).toEqual({
      lot_number: '3',
      title: 'Lote de prueba',
      category: 'hacienda',
      description: 'Descripción',
      base_price: '1000.00',
      min_increment: '50.00',
      reserve_price: '',
      requeue_preset_enabled: false,
      requeue_preset_base_price: '',
      requeue_preset_min_increment: '',
    });
  });
});
