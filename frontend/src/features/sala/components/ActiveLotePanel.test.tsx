import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveLotePanel } from './ActiveLotePanel';
import type { Lote } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: 'Toro reproductor de pedigrí.',
    category: 'hacienda',
    attributes: { peso_kg: 450, raza: 'Angus' },
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'open',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('ActiveLotePanel', () => {
  it('sin ofertas, la "oferta actual" es el precio inicial', () => {
    render(<ActiveLotePanel lote={makeLote()} currency="ARS" winningOffer={null} />);

    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Sin ofertas todavía')).toBeInTheDocument();
    // Precio inicial y "oferta actual" muestran el mismo monto cuando no hay ofertas.
    expect(screen.getAllByText(/1[.,]?000/).length).toBeGreaterThanOrEqual(2);
  });

  it('con una oferta ganadora, la "oferta actual" es su monto, no el precio inicial', () => {
    const winningOffer: OfertaSnapshotEntry = {
      id: 'oferta-1',
      buyer_id: null,
      amount: '1500.00',
      status: 'accepted',
      created_at: '2026-07-01T00:00:00Z',
    };

    render(<ActiveLotePanel lote={makeLote()} currency="ARS" winningOffer={winningOffer} />);

    expect(screen.getByText('Oferta actual')).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('muestra los atributos libres del lote en la ficha técnica', () => {
    render(<ActiveLotePanel lote={makeLote()} currency="ARS" winningOffer={null} />);

    expect(screen.getByText('Peso kg')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('Raza')).toBeInTheDocument();
    expect(screen.getByText('Angus')).toBeInTheDocument();
  });

  it('sin descripción, muestra el mensaje por defecto en vez de dejarla vacía', () => {
    render(<ActiveLotePanel lote={makeLote({ description: null })} currency="ARS" winningOffer={null} />);

    expect(screen.getByText('Este lote todavía no tiene una descripción cargada.')).toBeInTheDocument();
  });

  it('el botón "Realizar oferta" está deshabilitado', () => {
    render(<ActiveLotePanel lote={makeLote()} currency="ARS" winningOffer={null} />);

    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
  });
});
