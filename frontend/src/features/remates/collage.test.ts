import { describe, expect, it } from 'vitest';
import { pickLoteCoverImages } from './collage';
import type { Lote } from './types';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Lote genérico',
    description: null,
    category: 'otros',
    attributes: {},
    images: [],
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

describe('pickLoteCoverImages', () => {
  it('sin lotes, no hay nada que armar', () => {
    expect(pickLoteCoverImages([])).toEqual([]);
  });

  it('toma la primera imagen de cada lote, en el orden de los lotes', () => {
    const lotes = [
      makeLote({ id: '1', images: [{ url: 'a.jpg', order: 0, caption: null }] }),
      makeLote({ id: '2', images: [{ url: 'b.jpg', order: 0, caption: null }] }),
    ];
    expect(pickLoteCoverImages(lotes)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('dentro de un lote, respeta el `order` de sus imágenes, no el orden del array', () => {
    const lotes = [
      makeLote({
        images: [
          { url: 'segunda.jpg', order: 1, caption: null },
          { url: 'primera.jpg', order: 0, caption: null },
        ],
      }),
    ];
    expect(pickLoteCoverImages(lotes)).toEqual(['primera.jpg']);
  });

  it('lotes sin imágenes se saltean, sin dejar huecos', () => {
    const lotes = [
      makeLote({ id: '1', images: [] }),
      makeLote({ id: '2', images: [{ url: 'b.jpg', order: 0, caption: null }] }),
      makeLote({ id: '3', images: [] }),
      makeLote({ id: '4', images: [{ url: 'd.jpg', order: 0, caption: null }] }),
    ];
    expect(pickLoteCoverImages(lotes)).toEqual(['b.jpg', 'd.jpg']);
  });

  it('corta en `limit` imágenes encontradas, sin seguir recorriendo lotes de más', () => {
    const lotes = Array.from({ length: 10 }, (_, i) =>
      makeLote({ id: String(i), images: [{ url: `${i}.jpg`, order: 0, caption: null }] }),
    );
    expect(pickLoteCoverImages(lotes, 3)).toEqual(['0.jpg', '1.jpg', '2.jpg']);
  });
});
