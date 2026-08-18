import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfferHistoryList } from './OfferHistoryList';
import { formatTime } from '../../../shared/lib/format';
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

describe('OfferHistoryList', () => {
  it('sin ofertas, muestra un mensaje en vez de una lista vacía', () => {
    render(<OfferHistoryList recentOffers={[]} currency="ARS" />);
    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
  });

  it('muestra una fila por oferta, con su estado real (nunca un buyer_id crudo)', () => {
    const offers = [
      makeOffer({ id: 'a', amount: '1200.00', status: 'winning' }),
      makeOffer({ id: 'b', amount: '1000.00', status: 'outbid' }),
    ];

    render(<OfferHistoryList recentOffers={offers} currency="ARS" />);

    expect(screen.getByText('Ganadora')).toBeInTheDocument();
    expect(screen.getByText('Superada')).toBeInTheDocument();
    expect(screen.queryByText('a')).not.toBeInTheDocument();
  });

  it('cada oferta muestra solo el horario, no la fecha completa', () => {
    const offer = makeOffer({ created_at: '2026-07-01T18:30:00Z' });
    render(<OfferHistoryList recentOffers={[offer]} currency="ARS" />);

    expect(screen.getByText(formatTime(offer.created_at))).toBeInTheDocument();
  });
});
