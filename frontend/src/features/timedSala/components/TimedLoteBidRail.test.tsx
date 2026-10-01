import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Lote } from '../../remates/types';
import { TimedLoteBidRail, type TimedLoteBidRailProps } from './TimedLoteBidRail';

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
    timer_ends_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderRail(lote: Lote, overrides: Partial<TimedLoteBidRailProps> = {}) {
  return render(
    <MemoryRouter>
      <TimedLoteBidRail
        lote={lote}
        currency="ARS"
        leadingAmount={null}
        remateId="remate-1"
        remateStatus="live"
        viewerRole={undefined}
        isLeadingBidder={false}
        hasRequiredGuarantee
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('TimedLoteBidRail', () => {
  it('un lote abierto muestra su cuenta regresiva, el precio base y el llamado a ofertar', () => {
    renderRail(makeLote());

    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByText('Precio inicial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciá sesión para ofertar' })).toBeInTheDocument();
  });

  it('con una oferta vigente, muestra esa oferta como precio actual', () => {
    renderRail(makeLote(), { leadingAmount: '1500.00' });

    expect(screen.getByText(/Oferta actual/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('un lote abierto sin timer no muestra cuenta regresiva pero sí el formulario', () => {
    renderRail(makeLote({ timer_ends_at: null }));

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciá sesión para ofertar' })).toBeInTheDocument();
  });

  it('un lote vendido muestra el precio final, sin cuenta regresiva ni formulario', () => {
    renderRail(makeLote({ status: 'closed_sold', timer_ends_at: null, final_price: '3200.00' }));

    expect(screen.getByText('Precio final')).toBeInTheDocument();
    expect(screen.getByText(/3[.,]?200/)).toBeInTheDocument();
    expect(screen.getByText('Este lote ya se vendió. No se aceptan más ofertas.')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('un lote que cerró sin ofertas lo dice', () => {
    renderRail(makeLote({ status: 'closed_unsold', timer_ends_at: null }));

    expect(screen.getByText('Sin ofertas')).toBeInTheDocument();
    expect(screen.getByText('Este lote cerró sin ofertas.')).toBeInTheDocument();
  });

  it('un lote que todavía no abrió muestra la base con la que va a abrir', () => {
    renderRail(makeLote({ status: 'pending', timer_ends_at: null }));

    expect(screen.getByText('Precio base')).toBeInTheDocument();
    expect(screen.getByText(/Este lote todavía no abrió/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
