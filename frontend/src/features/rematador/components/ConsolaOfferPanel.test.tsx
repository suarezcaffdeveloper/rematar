import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsolaOfferPanel } from './ConsolaOfferPanel';
import type { OfertaSnapshotEntry } from '../../sala/types';

function makeOffer(overrides: Partial<OfertaSnapshotEntry> = {}): OfertaSnapshotEntry {
  return {
    id: 'oferta-1',
    buyer_id: null,
    amount: '1000.00',
    status: 'winning',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('ConsolaOfferPanel', () => {
  it('sin ofertas, muestra los dos estados vacíos', () => {
    render(<ConsolaOfferPanel winningOffer={null} recentOffers={[]} currency="ARS" />);
    expect(screen.getByText('Todavía no hay ofertas en este lote.')).toBeInTheDocument();
    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
  });

  it('con oferta líder, muestra "Comprador verificado" -- nunca una identidad', () => {
    render(
      <ConsolaOfferPanel
        winningOffer={makeOffer({ amount: '1500.00' })}
        recentOffers={[makeOffer({ amount: '1500.00' })]}
        currency="ARS"
      />,
    );
    expect(screen.getByText('Comprador verificado')).toBeInTheDocument();
    expect(screen.queryByText(/buyer|comprador-/i)).not.toBeInTheDocument();
  });

  it('destaca visualmente la primera entrada del historial (la más reciente) con "Última"', () => {
    render(
      <ConsolaOfferPanel
        winningOffer={makeOffer({ id: 'o2' })}
        recentOffers={[makeOffer({ id: 'o2', amount: '2000.00' }), makeOffer({ id: 'o1', amount: '1500.00' })]}
        currency="ARS"
      />,
    );

    const latestBadges = screen.getAllByText('Última');
    expect(latestBadges).toHaveLength(1);
  });

  it('muestra la hora de cada oferta', () => {
    render(
      <ConsolaOfferPanel
        winningOffer={null}
        recentOffers={[makeOffer({ created_at: '2026-07-01T10:30:00Z' })]}
        currency="ARS"
      />,
    );
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
