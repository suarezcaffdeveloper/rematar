import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { OfertaSnapshotEntry } from '../types';
import { SalaRecentOffers } from './SalaRecentOffers';

function offer(id: string, amount: string, status: OfertaSnapshotEntry['status'], buyerId: string | null = null): OfertaSnapshotEntry {
  return { id, buyer_id: buyerId, amount, status, created_at: '2026-07-01T00:00:00Z' };
}

describe('SalaRecentOffers', () => {
  it('sin ofertas, lo dice y no arma lista', () => {
    render(<SalaRecentOffers recentOffers={[]} winningOffer={null} currency="ARS" />);

    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('marca como ganadora la oferta vigente y como superadas las anteriores', () => {
    const winner = offer('o3', '1100.00', 'winning');
    render(
      <SalaRecentOffers
        recentOffers={[winner, offer('o2', '1050.00', 'outbid'), offer('o1', '1000.00', 'outbid')]}
        winningOffer={winner}
        currency="ARS"
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Ganadora')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Superada')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Superada')).toBeInTheDocument();
  });

  it('la oferta propia líder dice "Tu oferta lidera"; una propia superada, "Tú, superada"', () => {
    const own = offer('o2', '1100.00', 'winning', 'me');
    const { rerender } = render(
      <SalaRecentOffers recentOffers={[own]} winningOffer={own} currency="ARS" currentUserId="me" />,
    );
    expect(screen.getByText('Tu oferta lidera')).toBeInTheDocument();

    const rival = offer('o3', '1150.00', 'winning');
    rerender(
      <SalaRecentOffers
        recentOffers={[rival, { ...own, status: 'outbid' }]}
        winningOffer={rival}
        currency="ARS"
        currentUserId="me"
      />,
    );
    expect(screen.getByText('Tú, superada')).toBeInTheDocument();
    expect(screen.getByText('Ganadora')).toBeInTheDocument();
  });

  it('una oferta rechazada se muestra como tal', () => {
    const winner = offer('o2', '1100.00', 'winning');
    render(
      <SalaRecentOffers
        recentOffers={[winner, offer('o1', '1020.00', 'rejected')]}
        winningOffer={winner}
        currency="ARS"
      />,
    );

    expect(screen.getByText('Rechazada')).toBeInTheDocument();
  });

  it('sin oferta vigente (por ejemplo, tras un cierre) ninguna fila se marca como ganadora', () => {
    render(<SalaRecentOffers recentOffers={[offer('o1', '1000.00', 'outbid')]} winningOffer={null} currency="ARS" />);

    expect(screen.queryByText('Ganadora')).not.toBeInTheDocument();
  });

  it('la lista scrollea por dentro con un alto máximo acotado (cuatro filas por defecto)', () => {
    const winner = offer('o6', '1250.00', 'winning');
    const offers = [winner, ...['o5', 'o4', 'o3', 'o2', 'o1'].map((id, i) => offer(id, String(1200 - i * 50), 'outbid'))];
    render(<SalaRecentOffers recentOffers={offers} winningOffer={winner} currency="ARS" />);

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('list').parentElement).toHaveClass('max-h-[14.75rem]', 'overflow-y-auto');
  });

  it('muestra cuántas ofertas hay', () => {
    const winner = offer('o2', '1100.00', 'winning');
    render(<SalaRecentOffers recentOffers={[winner, offer('o1', '1000.00', 'outbid')]} winningOffer={winner} currency="ARS" />);

    expect(screen.getByRole('heading', { name: /^Ofertas recientes/ })).toHaveTextContent('2');
  });
});
