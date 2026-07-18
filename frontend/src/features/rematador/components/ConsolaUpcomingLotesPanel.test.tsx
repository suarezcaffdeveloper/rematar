import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolaUpcomingLotesPanel } from './ConsolaUpcomingLotesPanel';
import type { Lote } from '../../remates/types';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Vaquillona',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '500.00',
    min_increment: '25.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('ConsolaUpcomingLotesPanel', () => {
  it('sin lotes, muestra el mensaje de "no hay más lotes"', () => {
    render(<ConsolaUpcomingLotesPanel lotes={[]} selectedLoteId={null} onSelect={vi.fn()} selectionEnabled />);
    expect(screen.getByText('No hay más lotes cargados en este remate.')).toBeInTheDocument();
  });

  it('con selección deshabilitada, las tarjetas no son interactivas', () => {
    render(
      <ConsolaUpcomingLotesPanel
        lotes={[makeLote()]}
        selectedLoteId={null}
        onSelect={vi.fn()}
        selectionEnabled={false}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/La selección se habilita/)).toBeInTheDocument();
  });

  it('con selección habilitada, clickear una tarjeta llama a onSelect con su id', async () => {
    const onSelect = vi.fn();
    render(
      <ConsolaUpcomingLotesPanel
        lotes={[makeLote({ id: 'lote-9' })]}
        selectedLoteId={null}
        onSelect={onSelect}
        selectionEnabled
      />,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('lote-9');
  });

  it('marca aria-pressed en la tarjeta seleccionada', () => {
    render(
      <ConsolaUpcomingLotesPanel
        lotes={[makeLote({ id: 'lote-1' }), makeLote({ id: 'lote-2', title: 'Toro' })]}
        selectedLoteId="lote-2"
        onSelect={vi.fn()}
        selectionEnabled
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
  });
});
