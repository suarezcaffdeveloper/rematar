import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Lote } from '../../remates/types';
import { SalaUpcomingGrid } from './SalaUpcomingGrid';

function makeLote(id: string, overrides: Partial<Lote> = {}): Lote {
  return {
    id,
    remate_id: 'remate-1',
    lot_number: id,
    display_order: 0,
    title: `Lote ${id}`,
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '2500.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: false,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('SalaUpcomingGrid', () => {
  it('cargando, muestra esqueletos y ningún lote', () => {
    const { container } = render(<SalaUpcomingGrid lotes={[]} isLoading currency="ARS" />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('sin lotes, dice que no hay más', () => {
    render(<SalaUpcomingGrid lotes={[]} isLoading={false} currency="ARS" />);

    expect(screen.getByText('No hay más lotes cargados en este remate.')).toBeInTheDocument();
  });

  it('lista cada lote con su número, título y precio base, y cuántos quedan', () => {
    render(<SalaUpcomingGrid lotes={[makeLote('8'), makeLote('9')]} isLoading={false} currency="ARS" />);

    expect(screen.getByText('Quedan 2, en este orden.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Lote 8', { selector: 'p.text-xs' })).toBeInTheDocument();
    expect(screen.getAllByText(/Base .*2[.,]?500/)).toHaveLength(2);
  });

  it('con un solo lote, dice "Queda 1"', () => {
    render(<SalaUpcomingGrid lotes={[makeLote('8')]} isLoading={false} currency="ARS" />);

    expect(screen.getByText('Queda 1, en este orden.')).toBeInTheDocument();
  });

  it('no se puede entrar a un lote futuro: no hay botones ni links', () => {
    render(<SalaUpcomingGrid lotes={[makeLote('8'), makeLote('9')]} isLoading={false} currency="ARS" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('usa la primera foto por orden y cae a un respaldo si el lote no tiene fotos', () => {
    const conFotos = makeLote('8', {
      images: [
        { url: 'https://img.test/segunda.jpg', order: 1, caption: null },
        { url: 'https://img.test/primera.jpg', order: 0, caption: null },
      ],
    });
    const { container } = render(<SalaUpcomingGrid lotes={[conFotos, makeLote('9')]} isLoading={false} currency="ARS" />);

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://img.test/primera.jpg');
  });
});
