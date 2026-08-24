import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveLotePanel, type ActiveLotePanelProps } from './ActiveLotePanel';
import type { Lote } from '../../remates/types';

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
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<ActiveLotePanelProps> = {}): ActiveLotePanelProps {
  return {
    lote: makeLote(),
    ...overrides,
  };
}

describe('ActiveLotePanel', () => {
  it('muestra número de lote, categoría, título y descripción', () => {
    render(<ActiveLotePanel {...makeProps()} />);

    expect(screen.getByText('Lote 1 · Hacienda y ganadería')).toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Toro reproductor de pedigrí.')).toBeInTheDocument();
  });

  it('sin descripción, muestra el mensaje por defecto en vez de dejarla vacía', () => {
    render(<ActiveLotePanel {...makeProps({ lote: makeLote({ description: null }) })} />);

    expect(screen.getByText('Este lote todavía no tiene una descripción cargada.')).toBeInTheDocument();
  });

  it('no muestra el globito de estado del lote (pedido explícito de sacarlo)', () => {
    render(<ActiveLotePanel {...makeProps()} />);

    expect(screen.queryByText('Abierto')).not.toBeInTheDocument();
  });

  it('ya no muestra la ficha técnica (rediseño visual, pedido explícito) ni precio/formulario de oferta (se movieron a SalaBidPanel)', () => {
    render(<ActiveLotePanel {...makeProps()} />);

    expect(screen.queryByText('Ficha técnica')).not.toBeInTheDocument();
    expect(screen.queryByText('Peso kg')).not.toBeInTheDocument();
    expect(screen.queryByText('Precio inicial')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ofertar' })).not.toBeInTheDocument();
  });
});
