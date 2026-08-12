import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingLotesStrip } from './UpcomingLotesStrip';
import type { Lote } from '../../remates/types';

function makeLote(overrides: Partial<Lote>): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '2',
    display_order: 1,
    title: 'Próximo lote',
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
    status: 'pending',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('UpcomingLotesStrip', () => {
  it('sin lotes, muestra un mensaje en vez de una tira vacía', () => {
    render(<UpcomingLotesStrip lotes={[]} />);

    expect(screen.getByText('No hay más lotes cargados en este remate.')).toBeInTheDocument();
  });

  it('renderiza cada lote sin ningún control interactivo (no seleccionables)', () => {
    render(
      <UpcomingLotesStrip
        lotes={[makeLote({ id: 'a', title: 'Lote A' }), makeLote({ id: 'b', title: 'Lote B' })]}
      />,
    );

    expect(screen.getByText('Lote A')).toBeInTheDocument();
    expect(screen.getByText('Lote B')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
