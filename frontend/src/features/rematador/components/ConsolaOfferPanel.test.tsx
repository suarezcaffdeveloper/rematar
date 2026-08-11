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
  it('sin ofertas, muestra el estado vacío', () => {
    render(<ConsolaOfferPanel recentOffers={[]} currency="ARS" />);
    expect(screen.getByText('Todavía no hay ofertas en este lote.')).toBeInTheDocument();
  });

  it('no expone ninguna identidad del comprador -- solo el monto y el estado', () => {
    render(<ConsolaOfferPanel recentOffers={[makeOffer({ amount: '1500.00' })]} currency="ARS" />);
    expect(screen.queryByText(/buyer|comprador-/i)).not.toBeInTheDocument();
  });

  it('resalta en verde la oferta con estado "winning" -- es la única señal de quién va ganando', () => {
    render(
      <ConsolaOfferPanel
        recentOffers={[makeOffer({ id: 'o2', status: 'winning', amount: '2000.00' }), makeOffer({ id: 'o1', status: 'outbid', amount: '1500.00' })]}
        currency="ARS"
      />,
    );

    const winningRow = screen.getByText('Ganadora').closest('li') as HTMLElement;
    expect(winningRow.className).toContain('border-l-success-500');
    expect(winningRow.className).toContain('bg-success-50');

    const outbidRow = screen.getByText('Superada').closest('li') as HTMLElement;
    expect(outbidRow.className).not.toContain('border-l-success-500');
  });

  it('destaca visualmente la primera entrada del historial (la más reciente) con "Última"', () => {
    render(
      <ConsolaOfferPanel
        recentOffers={[makeOffer({ id: 'o2', amount: '2000.00' }), makeOffer({ id: 'o1', amount: '1500.00' })]}
        currency="ARS"
      />,
    );

    const latestBadges = screen.getAllByText('Última');
    expect(latestBadges).toHaveLength(1);
  });

  it('muestra la hora de cada oferta', () => {
    render(<ConsolaOfferPanel recentOffers={[makeOffer({ created_at: '2026-07-01T10:30:00Z' })]} currency="ARS" />);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('con maxHistory, sigue renderizando todo el historial pero limita el alto visible y agrega scroll', () => {
    const offers = [
      makeOffer({ id: 'o5', amount: '5000.00' }),
      makeOffer({ id: 'o4', amount: '4000.00' }),
      makeOffer({ id: 'o3', amount: '3000.00' }),
      makeOffer({ id: 'o2', amount: '2000.00' }),
      makeOffer({ id: 'o1', amount: '1000.00' }),
    ];

    render(<ConsolaOfferPanel recentOffers={offers} currency="ARS" maxHistory={3} />);

    // Ninguna oferta desaparece del DOM -- solo se recorta el alto del contenedor.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(screen.getByText('5')).toBeInTheDocument();

    const list = items[0].parentElement as HTMLElement;
    expect(list.className).toContain('overflow-y-auto');
    expect(list.style.maxHeight).not.toBe('');
  });
});
