import { describe, expect, it } from 'vitest';
import { countByStatus, guaranteeLabel, heroPhotos, sortedImages } from './ficha';
import type { Lote, Remate } from './types';

const image = (url: string, order: number) => ({ url, order, caption: null });

describe('sortedImages', () => {
  it('ordena por el campo order sin tocar el arreglo original', () => {
    const lote = { images: [image('b', 1), image('a', 0), image('c', 2)] };
    expect(sortedImages(lote).map((i) => i.url)).toEqual(['a', 'b', 'c']);
    expect(lote.images.map((i) => i.url)).toEqual(['b', 'a', 'c']);
  });
});

describe('heroPhotos', () => {
  const lotes = (...urls: (string | null)[]): Pick<Lote, 'images'>[] =>
    urls.map((url) => ({ images: url ? [image(url, 0)] : [] }));

  it('pone primero la portada del remate y completa con la primera foto de cada lote', () => {
    expect(heroPhotos({ cover_image_url: 'cover' }, lotes('l1', 'l2', 'l3'))).toEqual(['cover', 'l1', 'l2']);
  });

  it('sin portada propia, arma el mosaico solo con fotos de lotes', () => {
    expect(heroPhotos({ cover_image_url: null }, lotes('l1', 'l2', 'l3', 'l4'))).toEqual(['l1', 'l2', 'l3']);
  });

  it('salta lotes sin fotos y no repite una misma URL', () => {
    expect(heroPhotos({ cover_image_url: 'x' }, lotes(null, 'x', 'l2'))).toEqual(['x', 'l2']);
  });

  it('usa la foto con menor order de cada lote', () => {
    expect(heroPhotos({ cover_image_url: null }, [{ images: [image('segunda', 1), image('primera', 0)] }])).toEqual([
      'primera',
    ]);
  });

  it('devuelve vacío si no hay ninguna foto', () => {
    expect(heroPhotos({ cover_image_url: null }, lotes(null, null))).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('cuenta los lotes de cada estado', () => {
    const counts = countByStatus([{ status: 'open' }, { status: 'open' }, { status: 'pending' }]);
    expect(counts.get('open')).toBe(2);
    expect(counts.get('pending')).toBe(1);
    expect(counts.get('closed_sold')).toBeUndefined();
  });
});

describe('guaranteeLabel', () => {
  const settings = (overrides: Partial<Remate['settings']>): Remate['settings'] => ({
    anti_sniping_enabled: false,
    anti_sniping_extension_seconds: 60,
    currency: 'ARS',
    lote_timer_seconds: null,
    ...overrides,
  });

  it('sin garantía exigida', () => {
    expect(guaranteeLabel(settings({}))).toBe('No se requiere garantía');
    expect(guaranteeLabel(settings({ guarantee_required: false, guarantee_amount: '50000' }))).toBe(
      'No se requiere garantía',
    );
  });

  it('con garantía y monto, muestra el monto', () => {
    expect(guaranteeLabel(settings({ guarantee_required: true, guarantee_amount: '50000' }))).toMatch(/50\.000/);
  });

  it('con garantía pero sin monto configurado, dice "Requerida"', () => {
    expect(guaranteeLabel(settings({ guarantee_required: true, guarantee_amount: null }))).toBe('Requerida');
  });
});
