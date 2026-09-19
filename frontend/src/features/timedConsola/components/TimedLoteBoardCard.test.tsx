import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Lote } from '../../remates/types';
import { TimedLoteBoardCard } from './TimedLoteBoardCard';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'open',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(lote: Lote, leadingAmount: string | null = null) {
  return render(
    <TimedLoteBoardCard lote={lote} currency="ARS" leadingAmount={leadingAmount} offerCount={0} onSelect={vi.fn()} />,
  );
}

describe('TimedLoteBoardCard', () => {
  it('la portada tiene proporción fija y recorta la imagen (object-cover)', () => {
    renderCard(makeLote({ images: [{ url: 'https://example.com/a.jpg', order: 0, caption: null }] }));
    const cover = screen.getByTestId('lote-cover');
    expect(cover.className).toContain('aspect-[4/3]');
    expect(cover.className).toContain('overflow-hidden');
    expect(cover.querySelector('img')?.className).toContain('object-cover');
  });

  it('sin imagen, el placeholder ocupa el mismo contenedor de proporción fija', () => {
    renderCard(makeLote());
    const cover = screen.getByTestId('lote-cover');
    expect(cover.className).toContain('aspect-[4/3]');
    expect(cover.querySelector('img')).toBeNull();
  });

  it('con y sin ofertas reserva la misma estructura (la línea de base siempre existe)', () => {
    const { unmount } = renderCard(makeLote());
    const withoutBids = screen.getAllByText(/^Base:/).length;
    unmount();
    renderCard(makeLote(), '1500.00');
    expect(screen.getAllByText(/^Base:/).length).toBe(withoutBids);
  });
});
