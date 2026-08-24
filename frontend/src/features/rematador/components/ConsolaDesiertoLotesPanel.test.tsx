import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolaDesiertoLotesPanel } from './ConsolaDesiertoLotesPanel';
import type { Lote } from '../../remates/types';

vi.mock('../../remates/api', () => ({ requeueLoteRequest: vi.fn() }));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: vi.fn() }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '2',
    display_order: 0,
    title: 'Sembradora Apache',
    description: null,
    category: 'maquinaria_pesada_y_agricola',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'closed_unsold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    requeue_preset_enabled: false,
    requeue_preset_base_price: null,
    requeue_preset_min_increment: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('ConsolaDesiertoLotesPanel', () => {
  it('sin lotes desiertos, no renderiza nada (evita ruido en la interfaz)', () => {
    const { container } = render(
      <ConsolaDesiertoLotesPanel remateId="remate-1" lotes={[]} currency="ARS" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lista cada lote desierto con su número, título y botón "Volver a rematar"', () => {
    render(
      <ConsolaDesiertoLotesPanel
        remateId="remate-1"
        currency="ARS"
        lotes={[
          makeLote({ id: 'lote-1', lot_number: '2', title: 'Sembradora Apache' }),
          makeLote({ id: 'lote-2', lot_number: '5', title: 'Tractor John Deere' }),
        ]}
      />,
    );

    expect(screen.getByText('Lotes desiertos')).toBeInTheDocument();
    expect(screen.getByText('Sembradora Apache')).toBeInTheDocument();
    expect(screen.getByText('Tractor John Deere')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Volver a rematar' })).toHaveLength(2);
  });

  it('clickear "Volver a rematar" en una tarjeta abre el formulario inline de esa tarjeta, sin afectar las demás', async () => {
    render(
      <ConsolaDesiertoLotesPanel
        remateId="remate-1"
        currency="ARS"
        lotes={[
          makeLote({ id: 'lote-1', lot_number: '2', title: 'Sembradora Apache' }),
          makeLote({ id: 'lote-2', lot_number: '5', title: 'Tractor John Deere' }),
        ]}
      />,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Volver a rematar' })[0]);

    expect(screen.getByRole('button', { name: 'Confirmar reincorporación' })).toBeInTheDocument();
    // La segunda tarjeta sigue sin expandirse -- solo queda un botón "Volver a rematar" (el suyo).
    expect(screen.getAllByRole('button', { name: 'Volver a rematar' })).toHaveLength(1);
  });
});
