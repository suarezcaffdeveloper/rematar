import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteManagementCard } from './LoteManagementCard';
import type { Lote } from '../../remates/types';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '2',
    display_order: 1,
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
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof LoteManagementCard>[0]> = {}) {
  return {
    lote: makeLote(),
    currency: 'ARS',
    isEditable: true,
    canMoveUp: true,
    canMoveDown: true,
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    isDragOver: false,
    isDragging: false,
    ...overrides,
  };
}

describe('LoteManagementCard', () => {
  it('muestra número, nombre, categoría y precio', () => {
    render(<LoteManagementCard {...baseProps()} />);
    expect(screen.getByText('Lote 2')).toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText(/Hacienda/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]000/)).toBeInTheDocument();
  });

  it('el menú de acciones llama a editar/duplicar/eliminar', async () => {
    const props = baseProps();
    render(<LoteManagementCard {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para el lote 2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(props.onEdit).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para el lote 2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));
    expect(props.onDuplicate).toHaveBeenCalledTimes(1);
  });

  it('los botones de mover llaman a onMoveUp/onMoveDown', async () => {
    const props = baseProps();
    render(<LoteManagementCard {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mover lote 2 hacia arriba' }));
    expect(props.onMoveUp).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Mover lote 2 hacia abajo' }));
    expect(props.onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('canMoveUp/canMoveDown en false deshabilita el botón correspondiente', () => {
    render(<LoteManagementCard {...baseProps({ canMoveUp: false, canMoveDown: false })} />);
    expect(screen.getByRole('button', { name: 'Mover lote 2 hacia arriba' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover lote 2 hacia abajo' })).toBeDisabled();
  });

  it('isEditable=false: sin flechas de mover, y las acciones del menú quedan deshabilitadas', async () => {
    render(<LoteManagementCard {...baseProps({ isEditable: false })} />);

    expect(screen.queryByRole('button', { name: /Mover lote/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para el lote 2' }));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeDisabled();
  });
});
