import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveLotePanel, type ActiveLotePanelProps } from './ActiveLotePanel';
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
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<ActiveLotePanelProps> = {}): ActiveLotePanelProps {
  return {
    remateId: 'remate-1',
    lote: makeLote(),
    currency: 'ARS',
    winningOffer: null,
    remateStatus: 'live',
    viewerRole: 'comprador',
    ...overrides,
  };
}

describe('ActiveLotePanel', () => {
  it('sin ofertas, la "oferta actual" es el precio inicial', () => {
    render(<ActiveLotePanel {...makeProps()} />);

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

    render(<ActiveLotePanel {...makeProps({ winningOffer })} />);

    expect(screen.getByText('Oferta actual')).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('muestra los atributos libres del lote en la ficha técnica', () => {
    render(<ActiveLotePanel {...makeProps()} />);

    expect(screen.getByText('Peso kg')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('Raza')).toBeInTheDocument();
    expect(screen.getByText('Angus')).toBeInTheDocument();
  });

  it('sin descripción, muestra el mensaje por defecto en vez de dejarla vacía', () => {
    render(<ActiveLotePanel {...makeProps({ lote: makeLote({ description: null }) })} />);

    expect(screen.getByText('Este lote todavía no tiene una descripción cargada.')).toBeInTheDocument();
  });

  it('un comprador con el lote abierto y el remate en vivo ve el formulario de oferta habilitado', () => {
    render(<ActiveLotePanel {...makeProps()} />);

    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled();
  });

  it('un rematador visitando su propia sala ve el botón deshabilitado', () => {
    render(<ActiveLotePanel {...makeProps({ viewerRole: 'rematador' })} />);

    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
  });

  it('con el remate pausado, el botón queda deshabilitado aunque el lote siga abierto', () => {
    render(<ActiveLotePanel {...makeProps({ remateStatus: 'paused' })} />);

    expect(screen.getByRole('button', { name: 'Realizar oferta' })).toBeDisabled();
    expect(screen.getByText(/El remate no está en vivo/)).toBeInTheDocument();
  });

  it('con timer configurado, muestra la cuenta regresiva', () => {
    render(
      <ActiveLotePanel {...makeProps({ lote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) })} />,
    );
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('sin timer configurado, no muestra la cuenta regresiva', () => {
    render(<ActiveLotePanel {...makeProps()} />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
});
