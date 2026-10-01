import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Lote } from '../../remates/types';
import { TimedLoteShowcase } from './TimedLoteShowcase';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '7',
    display_order: 0,
    title: 'Toro Angus',
    description: 'Un toro de pedigrí.',
    category: 'hacienda',
    attributes: { raza: 'Angus' },
    images: [
      { url: 'https://img.test/a.jpg', order: 0, caption: null },
      { url: 'https://img.test/b.jpg', order: 1, caption: null },
    ],
    quantity: 3,
    unit_label: 'cabezas',
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'open',
    timer_ends_at: '2026-09-30T18:30:00Z',
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('TimedLoteShowcase', () => {
  it('muestra rubro, título, descripción, galería y los datos para ofertar', () => {
    render(<TimedLoteShowcase lote={makeLote()} currency="ARS" />);

    expect(screen.getByText(/Lote 7/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
    expect(screen.getByText('Un toro de pedigrí.')).toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('Incremento mínimo')).toBeInTheDocument();
    expect(screen.getByText('Cierra')).toBeInTheDocument();
  });

  it('nunca muestra la ficha técnica del lote (atributos, cantidad, unidad)', () => {
    render(<TimedLoteShowcase lote={makeLote()} currency="ARS" />);

    expect(screen.queryByText('Angus')).not.toBeInTheDocument();
    expect(screen.queryByText(/cabezas/)).not.toBeInTheDocument();
  });

  it('un lote que ya no está abierto no dice cuándo cierra', () => {
    render(<TimedLoteShowcase lote={makeLote({ status: 'closed_sold', timer_ends_at: null })} currency="ARS" />);

    expect(screen.queryByText('Cierra')).not.toBeInTheDocument();
  });

  it('sin descripción, avisa que todavía no hay una cargada', () => {
    render(<TimedLoteShowcase lote={makeLote({ description: null })} currency="ARS" />);

    expect(screen.getByText('Este lote todavía no tiene una descripción cargada.')).toBeInTheDocument();
  });

  it('sin fotos, no rompe', () => {
    render(<TimedLoteShowcase lote={makeLote({ images: [] })} currency="ARS" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
  });
});
