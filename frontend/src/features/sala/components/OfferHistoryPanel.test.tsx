import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfferHistoryPanel } from './OfferHistoryPanel';
import type { OfertaSnapshotEntry } from '../types';

function makeOffer(overrides: Partial<OfertaSnapshotEntry>): OfertaSnapshotEntry {
  return {
    id: 'oferta-1',
    buyer_id: null,
    amount: '1000.00',
    status: 'accepted',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('OfferHistoryPanel', () => {
  it('sin ofertas, no muestra un comprador líder ni un buyer_id crudo', () => {
    render(<OfferHistoryPanel winningOffer={null} recentOffers={[]} currency="ARS" />);

    expect(screen.getByText('Todavía no hay ofertas en este lote.')).toBeInTheDocument();
    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
  });

  it('con oferta ganadora, muestra al comprador de forma anónima (nunca su id)', () => {
    const winningOffer = makeOffer({ id: 'w1', amount: '1500.00' });

    render(<OfferHistoryPanel winningOffer={winningOffer} recentOffers={[winningOffer]} currency="ARS" />);

    expect(screen.getByText('Comprador verificado')).toBeInTheDocument();
    expect(screen.queryByText(winningOffer.id)).not.toBeInTheDocument();
  });

  it('muestra la cantidad de ofertas recientes y una entrada por cada una', () => {
    const offers = [
      makeOffer({ id: 'a', amount: '1200.00', status: 'accepted' }),
      makeOffer({ id: 'b', amount: '1000.00', status: 'outbid' }),
    ];

    render(<OfferHistoryPanel winningOffer={offers[0]} recentOffers={offers} currency="ARS" />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.getByText('Superada')).toBeInTheDocument();
  });
});
