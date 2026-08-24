import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesiertoLoteNotice } from './DesiertoLoteNotice';
import type { Lote } from '../../remates/types';

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
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('DesiertoLoteNotice', () => {
  it('con lote null, no muestra nada', () => {
    render(<DesiertoLoteNotice lote={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con un lote, se muestra como un diálogo centrado (no una tarjeta inline)', () => {
    render(<DesiertoLoteNotice lote={makeLote({ lot_number: '2' })} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Lote 2 quedó desierto');
    expect(dialog).toHaveTextContent('Podés incorporarlo de nuevo a la cola');
  });

  it('solo tiene un botón "Continuar" -- puramente informativo, sin acción de reincorporar', () => {
    render(<DesiertoLoteNotice lote={makeLote()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a rematar' })).not.toBeInTheDocument();
  });

  it('"Continuar" llama a onClose', async () => {
    const onClose = vi.fn();
    render(<DesiertoLoteNotice lote={makeLote()} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape también llama a onClose (mismo comportamiento que cualquier otro diálogo de la app)', async () => {
    const onClose = vi.fn();
    render(<DesiertoLoteNotice lote={makeLote()} onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
