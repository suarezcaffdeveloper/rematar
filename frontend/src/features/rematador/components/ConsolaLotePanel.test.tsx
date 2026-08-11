import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsolaLotePanel } from './ConsolaLotePanel';
import type { Lote } from '../../remates/types';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '3',
    display_order: 2,
    title: 'Toro Angus',
    description: 'Toro reproductor de alto valor genético.',
    category: 'hacienda',
    attributes: { raza: 'Angus', peso_kg: 480 },
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
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('ConsolaLotePanel', () => {
  it('sin lote activo, muestra un estado vacío', () => {
    render(<ConsolaLotePanel activeLote={null} currency="ARS" hasUpcomingLotes />);
    expect(screen.getByText('Sin lote activo en este momento')).toBeInTheDocument();
    expect(screen.getByText(/Abrí un lote desde el panel de control/)).toBeInTheDocument();
  });

  it('sin lote activo y sin próximos lotes, el mensaje lo aclara', () => {
    render(<ConsolaLotePanel activeLote={null} currency="ARS" hasUpcomingLotes={false} />);
    expect(screen.getByText('No quedan lotes pendientes en este remate.')).toBeInTheDocument();
  });

  it('con lote activo, muestra número, nombre, descripción y ficha técnica', () => {
    render(<ConsolaLotePanel activeLote={makeLote()} currency="ARS" hasUpcomingLotes />);

    expect(screen.getByText(/Lote 3/)).toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Toro reproductor de alto valor genético.')).toBeInTheDocument();
    expect(screen.getByText('Angus')).toBeInTheDocument();
  });

  it('muestra precio inicial e incremento mínimo como referencia chica -- sin ninguna "Oferta líder" (vive en ConsolaOfferPanel, no duplicada acá)', () => {
    render(<ConsolaLotePanel activeLote={makeLote()} currency="ARS" hasUpcomingLotes />);

    expect(screen.getByText(/Precio inicial/)).toBeInTheDocument();
    expect(screen.getByText(/incremento mínimo/)).toBeInTheDocument();
    expect(screen.queryByText('Oferta líder')).not.toBeInTheDocument();
  });

  it('no incluye ningún botón (las acciones viven en el panel de control)', () => {
    render(<ConsolaLotePanel activeLote={makeLote()} currency="ARS" hasUpcomingLotes />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
