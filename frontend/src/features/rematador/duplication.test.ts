import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lote, Remate } from '../remates/types';

const apiMocks = vi.hoisted(() => ({
  createRemateRequest: vi.fn(),
  createLoteRequest: vi.fn(),
  fetchLotesRequest: vi.fn(),
}));

vi.mock('../remates/api', () => apiMocks);

const { duplicateRemate, duplicateLote } = await import('./duplication');

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate original',
    description: 'Descripción',
    category: 'hacienda',
    cover_image_url: 'https://example.com/cover.jpg',
    location: 'Pergamino',
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: '2026-08-01T18:00:00Z',
    status: 'draft',
    settings: { anti_sniping_enabled: true, anti_sniping_extension_seconds: 90, currency: 'USD', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: { peso_kg: 480 },
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: '1200.00',
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

describe('duplicateRemate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea un remate nuevo con título sufijado y sin fechas', async () => {
    const source = makeRemate();
    apiMocks.createRemateRequest.mockResolvedValue(makeRemate({ id: 'remate-2', title: 'Remate original (copia)' }));
    apiMocks.fetchLotesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    const result = await duplicateRemate(source);

    expect(apiMocks.createRemateRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Remate original (copia)',
        category: 'hacienda',
        starts_at: null,
        ends_at: null,
        settings: source.settings,
      }),
    );
    expect(result.id).toBe('remate-2');
  });

  it('pide los lotes con un page_size que el backend acepta (tope 100)', async () => {
    apiMocks.createRemateRequest.mockResolvedValue(makeRemate({ id: 'remate-2' }));
    apiMocks.fetchLotesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    await duplicateRemate(makeRemate());

    expect(apiMocks.fetchLotesRequest).toHaveBeenCalledWith('remate-1', { page: 1, page_size: 100 });
  });

  it('copia todos los lotes del remate original al nuevo, en orden', async () => {
    apiMocks.createRemateRequest.mockResolvedValue(makeRemate({ id: 'remate-2' }));
    apiMocks.fetchLotesRequest.mockResolvedValue({
      items: [makeLote({ id: 'l1', lot_number: '1' }), makeLote({ id: 'l2', lot_number: '2', title: 'Vaquillona' })],
      total: 2,
      page: 1,
      page_size: 100,
    });
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());

    await duplicateRemate(makeRemate());

    expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(2);
    expect(apiMocks.createLoteRequest).toHaveBeenNthCalledWith(
      1,
      'remate-2',
      expect.objectContaining({ lot_number: '1', base_price: '1000.00', reserve_price: '1200.00' }),
    );
    expect(apiMocks.createLoteRequest).toHaveBeenNthCalledWith(
      2,
      'remate-2',
      expect.objectContaining({ lot_number: '2', title: 'Vaquillona' }),
    );
  });

  it('si el remate origen tiene más de 100 lotes, pagina hasta traerlos todos', async () => {
    apiMocks.createRemateRequest.mockResolvedValue(makeRemate({ id: 'remate-2' }));
    const firstPage = Array.from({ length: 100 }, (_, i) => makeLote({ id: `l${i}`, lot_number: `${i}` }));
    const secondPage = [makeLote({ id: 'l100', lot_number: '100' })];
    apiMocks.fetchLotesRequest.mockResolvedValueOnce({ items: firstPage, total: 101, page: 1, page_size: 100 });
    apiMocks.fetchLotesRequest.mockResolvedValueOnce({ items: secondPage, total: 101, page: 2, page_size: 100 });
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());

    await duplicateRemate(makeRemate());

    expect(apiMocks.fetchLotesRequest).toHaveBeenCalledTimes(2);
    expect(apiMocks.fetchLotesRequest).toHaveBeenNthCalledWith(1, 'remate-1', { page: 1, page_size: 100 });
    expect(apiMocks.fetchLotesRequest).toHaveBeenNthCalledWith(2, 'remate-1', { page: 2, page_size: 100 });
    expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(101);
  });
});

describe('duplicateLote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea una copia con título sufijado y lot_number único', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote({ id: 'lote-2' }));

    await duplicateLote('remate-1', makeLote({ lot_number: '1' }), ['1', '2']);

    expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
      'remate-1',
      expect.objectContaining({ lot_number: '1-copia', title: 'Toro Angus (copia)' }),
    );
  });

  it('si "1-copia" ya existe, prueba "1-copia-2"', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());

    await duplicateLote('remate-1', makeLote({ lot_number: '1' }), ['1', '1-copia']);

    expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
      'remate-1',
      expect.objectContaining({ lot_number: '1-copia-2' }),
    );
  });

  it('preserva atributos y precios del lote original', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());

    await duplicateLote('remate-1', makeLote({ attributes: { peso_kg: 480, raza: 'Angus' } }), []);

    expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
      'remate-1',
      expect.objectContaining({ attributes: { peso_kg: 480, raza: 'Angus' } }),
    );
  });
});
