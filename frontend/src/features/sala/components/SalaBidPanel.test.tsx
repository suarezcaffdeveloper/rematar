import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalaBidPanel, type SalaBidPanelProps } from './SalaBidPanel';
import type { Lote } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';

vi.mock('../api', () => ({ placeBidRequest: vi.fn() }));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: vi.fn() }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
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

function makeProps(overrides: Partial<SalaBidPanelProps> = {}): SalaBidPanelProps {
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

describe('SalaBidPanel', () => {
  it('sin ofertas, la "oferta actual" es el precio inicial', () => {
    render(<SalaBidPanel {...makeProps()} />);

    expect(screen.getByText('Precio inicial')).toBeInTheDocument();
    expect(screen.getAllByText(/1[.,]?000/).length).toBeGreaterThanOrEqual(2);
  });

  it('con una oferta ganadora, la "oferta actual" es su monto y marca al comprador como verificado', () => {
    const winningOffer: OfertaSnapshotEntry = {
      id: 'oferta-1',
      buyer_id: null,
      amount: '1500.00',
      status: 'accepted',
      created_at: '2026-07-01T00:00:00Z',
    };

    render(<SalaBidPanel {...makeProps({ winningOffer })} />);

    expect(screen.getByText('Oferta actual · Comprador verificado')).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('renderiza el formulario de oferta real (PlaceBidButton) -- comprador con lote abierto y remate en vivo lo ve habilitado', () => {
    render(<SalaBidPanel {...makeProps()} />);

    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled();
  });

  it('sin cuenta regresiva (decisión visual confirmada -- el timer ya no se muestra en la Sala)', () => {
    render(<SalaBidPanel {...makeProps({ lote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) })} />);

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
});
