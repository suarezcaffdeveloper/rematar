import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsolaDesiertoLotesPanel } from './ConsolaDesiertoLotesPanel';
import type { Lote } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({
  requeueLotePresetRequest: vi.fn(),
  requeueLoteRequest: vi.fn(),
}));
vi.mock('../../remates/api', () => apiMocks);

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '7',
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
    status: 'closed_unsold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: false,
    round_number: 1,
    requeue_preset_enabled: false,
    requeue_preset_base_price: null,
    requeue_preset_min_increment: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Lote;
}

describe('ConsolaDesiertoLotesPanel', () => {
  it('sin lotes desiertos, no renderiza nada', () => {
    const { container } = render(
      <ConsolaDesiertoLotesPanel remateId="remate-1" lotes={[]} currency="ARS" canUseCustomPrice={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lote sin preset, empresa (canUseCustomPrice): muestra "Volver a rematar" con precio libre', () => {
    render(
      <ConsolaDesiertoLotesPanel
        remateId="remate-1"
        lotes={[makeLote()]}
        currency="ARS"
        canUseCustomPrice
      />,
    );
    expect(screen.getByRole('button', { name: /volver a rematar/i })).toBeInTheDocument();
    expect(screen.queryByText(/necesita que la empresa defina un precio/i)).not.toBeInTheDocument();
  });

  it('lote sin preset, rematador (sin canUseCustomPrice): no ofrece precio libre, solo avisa', () => {
    render(
      <ConsolaDesiertoLotesPanel
        remateId="remate-1"
        lotes={[makeLote()]}
        currency="ARS"
        canUseCustomPrice={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /volver a rematar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/necesita que la empresa defina un precio/i)).toBeInTheDocument();
  });

  it('lote con preset, rematador: puede reencolar en un click, sin link a precio libre', () => {
    render(
      <ConsolaDesiertoLotesPanel
        remateId="remate-1"
        lotes={[makeLote({ requeue_preset_enabled: true, requeue_preset_base_price: '900.00', requeue_preset_min_increment: '50.00' })]}
        currency="ARS"
        canUseCustomPrice={false}
      />,
    );
    expect(screen.getByRole('button', { name: /volver a rematar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /usar otro precio/i })).not.toBeInTheDocument();
  });

  it('lote con preset, empresa: además del click preautorizado, ofrece "Usar otro precio"', () => {
    render(
      <ConsolaDesiertoLotesPanel
        remateId="remate-1"
        lotes={[makeLote({ requeue_preset_enabled: true, requeue_preset_base_price: '900.00', requeue_preset_min_increment: '50.00' })]}
        currency="ARS"
        canUseCustomPrice
      />,
    );
    expect(screen.getByRole('button', { name: /volver a rematar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /usar otro precio/i })).toBeInTheDocument();
  });
});
