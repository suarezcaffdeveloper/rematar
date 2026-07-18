import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterAndSortRemates, type RemateFilters } from './filtering';
import type { Remate } from './types';

function makeRemate(overrides: Partial<Remate>): Remate {
  return {
    id: 'id-1',
    owner_id: 'owner-1',
    title: 'Remate genérico',
    description: null,
    category: 'otros',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'scheduled',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const REMATES: Remate[] = [
  makeRemate({
    id: 'a',
    title: 'Subasta de maquinaria agrícola',
    category: 'maquinaria_agricola',
    status: 'scheduled',
    starts_at: '2026-08-01T10:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
  }),
  makeRemate({
    id: 'b',
    title: 'Remate de vehículos usados',
    category: 'vehiculos',
    status: 'live',
    starts_at: '2026-07-15T10:00:00Z',
    created_at: '2026-07-10T00:00:00Z',
  }),
  makeRemate({
    id: 'c',
    title: 'Antigüedades y arte colonial',
    category: 'arte_y_antiguedades',
    status: 'finished',
    starts_at: '2026-06-01T10:00:00Z',
    created_at: '2026-06-15T00:00:00Z',
  }),
  makeRemate({
    id: 'd',
    title: 'Otro remate sin fecha programada',
    category: 'otros',
    status: 'cancelled',
    starts_at: null,
    created_at: '2026-05-01T00:00:00Z',
  }),
];

describe('filterAndSortRemates', () => {
  it('sin filtros aplicados, devuelve todos los remates', () => {
    const result = filterAndSortRemates(REMATES, DEFAULT_FILTERS);
    expect(result).toHaveLength(4);
  });

  it('filtra por título de forma case-insensitive y parcial', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, search: 'VEHÍCULOS' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('filtra por estado', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, status: 'live' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('filtra por categoría', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, category: 'vehiculos' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('combina búsqueda, estado y categoría (AND, no OR)', () => {
    const filters: RemateFilters = {
      ...DEFAULT_FILTERS,
      search: 'remate',
      status: 'live',
      category: 'vehiculos',
    };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('ordena "proximos" por starts_at ascendente, sin fecha al final', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, sort: 'proximos' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result.map((r) => r.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('ordena "recientes" por created_at descendente', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, sort: 'recientes' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result.map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('ordena "en_vivo" con los remates live primero', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, sort: 'en_vivo' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result[0]?.id).toBe('b');
  });

  it('devuelve una lista vacía si nada coincide', () => {
    const filters: RemateFilters = { ...DEFAULT_FILTERS, search: 'no existe ningún remate así' };
    const result = filterAndSortRemates(REMATES, filters);
    expect(result).toHaveLength(0);
  });
});
