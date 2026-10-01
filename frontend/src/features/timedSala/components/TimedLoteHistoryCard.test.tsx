import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OfertaSnapshotEntry } from '../../sala/types';
import { TimedLoteHistoryCard } from './TimedLoteHistoryCard';

const { useLoteRecentOffersMock } = vi.hoisted(() => ({ useLoteRecentOffersMock: vi.fn() }));
vi.mock('../hooks', () => ({ useLoteRecentOffers: useLoteRecentOffersMock }));

function offer(id: string, amount: string, status: OfertaSnapshotEntry['status'], buyerId: string | null = null) {
  return { id, buyer_id: buyerId, amount, status, created_at: new Date().toISOString() } as OfertaSnapshotEntry;
}

function renderCard(currentUserId: string | null = null) {
  return render(
    <TimedLoteHistoryCard
      remateId="remate-1"
      loteId="lote-1"
      offerActivityVersion={3}
      currency="ARS"
      currentUserId={currentUserId}
    />,
  );
}

describe('TimedLoteHistoryCard', () => {
  beforeEach(() => {
    useLoteRecentOffersMock.mockReset();
  });

  it('pide las ofertas del lote y se refresca cuando sube la actividad', () => {
    useLoteRecentOffersMock.mockReturnValue({ offers: [], isLoading: false });

    renderCard();

    expect(useLoteRecentOffersMock).toHaveBeenCalledWith('remate-1', 'lote-1', 3);
  });

  it('sin ofertas, lo dice', () => {
    useLoteRecentOffersMock.mockReturnValue({ offers: [], isLoading: false });

    renderCard();

    expect(screen.getByRole('heading', { name: /Ofertas recientes/ })).toBeInTheDocument();
    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
  });

  it('marca como ganadora la oferta que el servidor marca "winning", y las demás como superadas', () => {
    useLoteRecentOffersMock.mockReturnValue({
      offers: [offer('a', '1200.00', 'winning'), offer('b', '1100.00', 'outbid')],
      isLoading: false,
    });

    renderCard();

    expect(screen.getByText('Ganadora')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('si la oferta ganadora es tuya, dice que tu oferta lidera', () => {
    useLoteRecentOffersMock.mockReturnValue({
      offers: [offer('a', '1200.00', 'winning', 'yo')],
      isLoading: false,
    });

    renderCard('yo');

    expect(screen.getByText('Tu oferta lidera')).toBeInTheDocument();
  });
});
