import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMATE_FORM_VALUES,
  buildRemateFormPayload,
  remateToFormValues,
  validateRemateForm,
  type RemateFormValues,
} from './remateForm';
import type { Remate } from '../remates/types';

function makeValues(overrides: Partial<RemateFormValues> = {}): RemateFormValues {
  return {
    ...DEFAULT_REMATE_FORM_VALUES,
    title: 'Remate de hacienda',
    category: 'hacienda',
    ...overrides,
  };
}

describe('validateRemateForm', () => {
  it('valores válidos, sin errores', () => {
    expect(validateRemateForm(makeValues())).toEqual({});
  });

  it('título muy corto o muy largo', () => {
    expect(validateRemateForm(makeValues({ title: 'ab' }))).toHaveProperty('title');
    expect(validateRemateForm(makeValues({ title: 'a'.repeat(201) }))).toHaveProperty('title');
  });

  it('sin categoría', () => {
    expect(validateRemateForm(makeValues({ category: '' }))).toHaveProperty('category');
  });

  it('descripción/ubicación demasiado largas', () => {
    expect(validateRemateForm(makeValues({ description: 'a'.repeat(5001) }))).toHaveProperty('description');
    expect(validateRemateForm(makeValues({ location: 'a'.repeat(256) }))).toHaveProperty('location');
  });

  it('URL de portada inválida', () => {
    expect(validateRemateForm(makeValues({ cover_image_url: 'no-es-una-url' }))).toHaveProperty(
      'cover_image_url',
    );
  });

  it('fecha de fin anterior o igual a la de inicio', () => {
    const result = validateRemateForm(
      makeValues({ starts_at: '2026-08-01T14:00', ends_at: '2026-08-01T14:00' }),
    );
    expect(result).toHaveProperty('ends_at');
  });

  it('fecha de fin posterior a la de inicio, sin error', () => {
    const result = validateRemateForm(
      makeValues({ starts_at: '2026-08-01T14:00', ends_at: '2026-08-01T18:00' }),
    );
    expect(result.ends_at).toBeUndefined();
  });

  it('moneda inválida', () => {
    expect(validateRemateForm(makeValues({ currency: 'AR' }))).toHaveProperty('currency');
    expect(validateRemateForm(makeValues({ currency: '123' }))).toHaveProperty('currency');
  });

  it('anti-sniping habilitado con segundos fuera de rango', () => {
    const result = validateRemateForm(
      makeValues({ anti_sniping_enabled: true, anti_sniping_extension_seconds: '5' }),
    );
    expect(result).toHaveProperty('anti_sniping_extension_seconds');
  });

  it('anti-sniping deshabilitado, ignora los segundos aunque sean inválidos', () => {
    const result = validateRemateForm(
      makeValues({ anti_sniping_enabled: false, anti_sniping_extension_seconds: 'no-numero' }),
    );
    expect(result.anti_sniping_extension_seconds).toBeUndefined();
  });
});

describe('buildRemateFormPayload', () => {
  it('mapea los campos y normaliza la moneda a mayúsculas', () => {
    const payload = buildRemateFormPayload(makeValues({ currency: 'ars' }));
    expect(payload.title).toBe('Remate de hacienda');
    expect(payload.category).toBe('hacienda');
    expect(payload.settings?.currency).toBe('ARS');
  });

  it('campos vacíos se mandan como null, no como string vacío', () => {
    const payload = buildRemateFormPayload(makeValues({ description: '', location: '', cover_image_url: '' }));
    expect(payload.description).toBeNull();
    expect(payload.location).toBeNull();
    expect(payload.cover_image_url).toBeNull();
  });

  it('convierte datetime-local a ISO', () => {
    const payload = buildRemateFormPayload(makeValues({ starts_at: '2026-08-01T14:00' }));
    expect(payload.starts_at).toBe(new Date('2026-08-01T14:00').toISOString());
  });

  it('anti-sniping deshabilitado, siempre manda 60 como default', () => {
    const payload = buildRemateFormPayload(
      makeValues({ anti_sniping_enabled: false, anti_sniping_extension_seconds: 'lo que sea' }),
    );
    expect(payload.settings?.anti_sniping_extension_seconds).toBe(60);
  });
});

describe('remateToFormValues', () => {
  it('mapea un Remate existente a valores de formulario editables', () => {
    const remate: Remate = {
      id: 'r1',
      owner_id: 'o1',
      title: 'Mi remate',
      description: 'Una descripción',
      category: 'vehiculos',
      cover_image_url: 'https://example.com/cover.jpg',
      location: 'Buenos Aires',
      starts_at: '2026-08-01T14:00:00Z',
      ends_at: null,
      status: 'draft',
      settings: { anti_sniping_enabled: true, anti_sniping_extension_seconds: 90, currency: 'USD' },
      cancellation_reason: null,
      cancelled_at: null,
      finished_at: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    };

    const values = remateToFormValues(remate);

    expect(values.title).toBe('Mi remate');
    expect(values.category).toBe('vehiculos');
    expect(values.currency).toBe('USD');
    expect(values.anti_sniping_enabled).toBe(true);
    expect(values.anti_sniping_extension_seconds).toBe('90');
    expect(values.starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
