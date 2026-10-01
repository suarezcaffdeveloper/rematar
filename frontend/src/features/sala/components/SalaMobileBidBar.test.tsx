import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Lote } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';
import { SalaMobileBidBar } from './SalaMobileBidBar';

const lote = {
  id: 'lote-1',
  base_price: '1000.00',
} as Lote;

const winning: OfertaSnapshotEntry = {
  id: 'o1',
  buyer_id: null,
  amount: '1500.00',
  status: 'winning',
  created_at: '2026-07-01T00:00:00Z',
};

describe('SalaMobileBidBar', () => {
  it('sin ofertas, muestra el precio inicial y el atajo para ofertar', () => {
    render(<SalaMobileBidBar lote={lote} winningOffer={null} currency="ARS" isLeadingBidder={false} />);

    expect(screen.getByText('Precio inicial')).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?000/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ofertar' })).toHaveAttribute('href', '#bid-form');
  });

  it('con una oferta vigente, muestra esa oferta', () => {
    render(<SalaMobileBidBar lote={lote} winningOffer={winning} currency="ARS" isLeadingBidder={false} />);

    expect(screen.getByText('Oferta actual')).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('si ibas liderando, el botón lo dice', () => {
    render(<SalaMobileBidBar lote={lote} winningOffer={winning} currency="ARS" isLeadingBidder />);

    expect(screen.getByRole('link', { name: 'Vas liderando' })).toBeInTheDocument();
  });

  it('solo se ve en pantallas chicas (se oculta desde xl)', () => {
    const { container } = render(
      <SalaMobileBidBar lote={lote} winningOffer={null} currency="ARS" isLeadingBidder={false} />,
    );

    expect(container.firstElementChild).toHaveClass('xl:hidden');
  });
});
