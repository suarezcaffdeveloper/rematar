import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CaseCard } from './CaseCard';
import type { PostAuctionCase } from '../types';

const CASE: PostAuctionCase = {
  id: 'case-1',
  lote_id: 'lote-1',
  lot_number: '7',
  lote_title: 'Toro Angus',
  lote_cover_image_url: null,
  remate_id: 'remate-1',
  remate_title: 'Remate de campo',
  buyer_id: 'buyer-1',
  buyer_name: 'Juan Comprador',
  rematador_id: 'rematador-1',
  rematador_name: 'Ana Rematadora',
  base_price: '1000.00',
  final_price: '1500.00',
  status: 'pago_recibido',
  contacted_at: '2026-07-20T10:00:00Z',
  payment_at: '2026-07-21T10:00:00Z',
  shipped_at: null,
  delivered_at: null,
  finalized_at: null,
  notes: null,
  created_at: '2026-07-20T09:00:00Z',
  updated_at: '2026-07-21T10:00:00Z',
};

function renderCard(perspective: 'rematador' | 'comprador') {
  return render(
    <MemoryRouter>
      <CaseCard item={CASE} to="/x" perspective={perspective} />
    </MemoryRouter>,
  );
}

describe('CaseCard', () => {
  it('perspectiva rematador muestra el nombre del comprador', () => {
    renderCard('rematador');
    expect(screen.getByText('Comprador')).toBeInTheDocument();
    expect(screen.getByText('Juan Comprador')).toBeInTheDocument();
  });

  it('perspectiva comprador muestra el nombre del rematador', () => {
    renderCard('comprador');
    expect(screen.getByText('Rematador')).toBeInTheDocument();
    expect(screen.getByText('Ana Rematadora')).toBeInTheDocument();
  });

  it('muestra el lote, el remate y el precio final', () => {
    renderCard('rematador');
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText(/Lote 7/)).toBeInTheDocument();
    expect(screen.getByText(/Remate de campo/)).toBeInTheDocument();
    expect(screen.getByText(/\$\s?1\.500/)).toBeInTheDocument();
  });
});
