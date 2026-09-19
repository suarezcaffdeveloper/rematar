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

  it('live: ignora anti-sniping y cuenta regresiva aunque tengan valores inválidos', () => {
    const result = validateRemateForm(
      makeValues({
        anti_sniping_enabled: true,
        anti_sniping_extension_seconds: '5',
        lote_timer_enabled: true,
        lote_timer_seconds: '4',
      }),
    );
    expect(result).toEqual({});
  });

  it('timed: valores válidos, sin errores', () => {
    const result = validateRemateForm(
      makeValues({
        auction_type: 'timed',
        starts_at: '2026-08-01T14:00',
        ends_at: '2026-08-08T14:00',
      }),
    );
    expect(result).toEqual({});
  });

  it('timed: exige starts_at y ends_at (a diferencia de live, donde son opcionales)', () => {
    const result = validateRemateForm(makeValues({ auction_type: 'timed' }));
    expect(result).toHaveProperty('starts_at');
    expect(result).toHaveProperty('ends_at');
  });

  it('timed: anti-sniping habilitado exige ventana y duración dentro de rango', () => {
    const result = validateRemateForm(
      makeValues({
        auction_type: 'timed',
        starts_at: '2026-08-01T14:00',
        ends_at: '2026-08-08T14:00',
        anti_sniping_enabled: true,
        timed_extension_window_seconds: '5',
        timed_extension_duration_seconds: '5000',
      }),
    );
    expect(result).toHaveProperty('timed_extension_window_seconds');
    expect(result).toHaveProperty('timed_extension_duration_seconds');
  });

  it('timed: ignora lote_timer_seconds/anti_sniping_extension_seconds de live', () => {
    const result = validateRemateForm(
      makeValues({
        auction_type: 'timed',
        starts_at: '2026-08-01T14:00',
        ends_at: '2026-08-08T14:00',
        lote_timer_enabled: true,
        lote_timer_seconds: '4', // inválido para LIVE, pero TIMED ni lo mira
      }),
    );
    expect(result.lote_timer_seconds).toBeUndefined();
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

  it('live: nunca manda anti-sniping ni cuenta regresiva, aunque el form los tenga cargados', () => {
    const payload = buildRemateFormPayload(
      makeValues({
        anti_sniping_enabled: true,
        anti_sniping_extension_seconds: '90',
        lote_timer_enabled: true,
        lote_timer_seconds: '45',
      }),
    );
    expect(payload.settings?.anti_sniping_enabled).toBe(false);
    expect(payload.settings?.lote_timer_seconds).toBeNull();
    expect(payload.settings?.anti_sniping_extension_seconds).toBeUndefined();
  });

  it('timed: manda auction_type y nunca lote_timer_seconds', () => {
    const payload = buildRemateFormPayload(
      makeValues({
        auction_type: 'timed',
        starts_at: '2026-08-01T14:00',
        ends_at: '2026-08-08T14:00',
        lote_timer_enabled: true,
        lote_timer_seconds: '999', // ni siquiera se lee para TIMED
      }),
    );
    expect(payload.auction_type).toBe('timed');
    expect(payload.settings?.lote_timer_seconds).toBeNull();
  });

  it('timed: anti-sniping habilitado manda ventana y duración por separado', () => {
    const payload = buildRemateFormPayload(
      makeValues({
        auction_type: 'timed',
        anti_sniping_enabled: true,
        timed_extension_window_seconds: '30',
        timed_extension_duration_seconds: '90',
      }),
    );
    expect(payload.settings?.timed_extension_window_seconds).toBe(30);
    expect(payload.settings?.timed_extension_duration_seconds).toBe(90);
    expect(payload.settings?.anti_sniping_extension_seconds).toBeUndefined();
  });

  it('timed: anti-sniping deshabilitado manda null en ventana y duración', () => {
    const payload = buildRemateFormPayload(
      makeValues({
        auction_type: 'timed',
        anti_sniping_enabled: false,
        timed_extension_window_seconds: '30',
        timed_extension_duration_seconds: '90',
      }),
    );
    expect(payload.settings?.timed_extension_window_seconds).toBeNull();
    expect(payload.settings?.timed_extension_duration_seconds).toBeNull();
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
      settings: {
        anti_sniping_enabled: true,
        anti_sniping_extension_seconds: 90,
        currency: 'USD',
        lote_timer_seconds: 45,
        timed_extension_window_seconds: null,
        timed_extension_duration_seconds: null,
      },
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
    // LIVE ya no tiene anti-sniping ni cuenta regresiva: se ignoran aunque el remate
    // guardado los tenga (remates viejos).
    expect(values.anti_sniping_enabled).toBe(false);
    expect(values.lote_timer_enabled).toBe(false);
    expect(values.starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('sin cuenta regresiva configurada, la deja deshabilitada con el default', () => {
    const remate: Remate = {
      id: 'r1',
      owner_id: 'o1',
      title: 'Mi remate',
      description: null,
      category: 'vehiculos',
      cover_image_url: null,
      location: null,
      starts_at: null,
      ends_at: null,
      status: 'draft',
      settings: {
        anti_sniping_enabled: false,
        anti_sniping_extension_seconds: 60,
        currency: 'ARS',
        lote_timer_seconds: null,
        timed_extension_window_seconds: null,
        timed_extension_duration_seconds: null,
      },
      cancellation_reason: null,
      cancelled_at: null,
      finished_at: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    };

    const values = remateToFormValues(remate);

    expect(values.lote_timer_enabled).toBe(false);
    expect(values.lote_timer_seconds).toBe(DEFAULT_REMATE_FORM_VALUES.lote_timer_seconds);
  });

  it('mapea un remate Timed, incluyendo ventana y duración de anti-sniping', () => {
    const remate: Remate = {
      id: 'r1',
      owner_id: 'o1',
      title: 'Remate timed',
      description: null,
      category: 'hacienda',
      cover_image_url: null,
      location: null,
      starts_at: '2026-08-01T14:00:00Z',
      ends_at: '2026-08-08T14:00:00Z',
      status: 'draft',
      auction_type: 'timed',
      settings: {
        anti_sniping_enabled: true,
        anti_sniping_extension_seconds: 60,
        currency: 'ARS',
        lote_timer_seconds: null,
        timed_extension_window_seconds: 45,
        timed_extension_duration_seconds: 150,
      },
      cancellation_reason: null,
      cancelled_at: null,
      finished_at: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    };

    const values = remateToFormValues(remate);

    expect(values.auction_type).toBe('timed');
    expect(values.timed_extension_window_seconds).toBe('45');
    expect(values.timed_extension_duration_seconds).toBe('150');
  });
});
