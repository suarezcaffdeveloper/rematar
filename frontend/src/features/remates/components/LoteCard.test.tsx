import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoteCard } from './LoteCard';
import type { Lote } from '../types';

function makeLote(overrides: Partial<Lote>): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '12',
    display_order: 0,
    title: 'Tractor John Deere',
    description: 'Tractor en excelente estado, motor revisado.',
    category: 'maquinaria_agricola',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('LoteCard', () => {
  it('muestra número de lote, título, descripción y estado', () => {
    render(<LoteCard lote={makeLote({ status: 'open' })} />);

    expect(screen.getByText('Lote 12')).toBeInTheDocument();
    expect(screen.getByText('Tractor John Deere')).toBeInTheDocument();
    expect(screen.getByText('Tractor en excelente estado, motor revisado.')).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
  });

  it('sin imágenes, no intenta renderizar un <img> roto', () => {
    render(<LoteCard lote={makeLote({ images: [] })} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('con varias imágenes, usa la de menor "order" como principal', () => {
    render(
      <LoteCard
        lote={makeLote({
          images: [
            { url: 'https://example.com/second.jpg', order: 2, caption: 'Segunda' },
            { url: 'https://example.com/first.jpg', order: 1, caption: 'Principal' },
          ],
        })}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/first.jpg');
  });

  it('sin descripción, no deja un párrafo vacío', () => {
    render(<LoteCard lote={makeLote({ description: null })} />);

    expect(screen.getByText('Tractor John Deere')).toBeInTheDocument();
  });
});
