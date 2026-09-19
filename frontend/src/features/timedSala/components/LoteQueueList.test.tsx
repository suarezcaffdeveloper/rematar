import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteQueueList } from './LoteQueueList';
import type { Lote } from '../../remates/types';

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

function renderList(props: Partial<React.ComponentProps<typeof LoteQueueList>> = {}) {
  return render(
    <LoteQueueList
      lotes={[]}
      selectedLoteId=""
      onSelect={vi.fn()}
      leadingAmounts={{}}
      currency="ARS"
      {...props}
    />,
  );
}

describe('LoteQueueList', () => {
  it('sin lotes, no renderiza nada', () => {
    const { container } = renderList();
    expect(container).toBeEmptyDOMElement();
  });

  it('la card activa muestra número, título y "Base apertura" sin ofertas todavía', () => {
    const lotes = [makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus', base_price: '1000.00' })];

    renderList({ lotes, selectedLoteId: 'lote-1' });

    const active = screen.getByRole('option', { name: 'Lote 1: Toro Angus' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveTextContent('Base apertura:');
    expect(active).toHaveTextContent(/1[.,]000/);
  });

  it('con oferta líder, muestra "Precio actual" con el monto', () => {
    const lotes = [makeLote({ id: 'lote-1', status: 'open' })];

    renderList({ lotes, selectedLoteId: 'lote-1', leadingAmounts: { 'lote-1': '1200.00' } });

    const active = screen.getByRole('option', { name: /Toro Angus/ });
    expect(active).toHaveTextContent('Precio actual:');
    expect(active).toHaveTextContent(/1[.,]200/);
  });

  it('un lote sin ofertas al cerrar, avisa que no tuvo ofertas', () => {
    const lotes = [makeLote({ id: 'lote-1', status: 'closed_unsold' })];

    renderList({ lotes, selectedLoteId: 'lote-1' });

    expect(screen.getByText('Sin ofertas')).toBeInTheDocument();
  });

  it('con un único lote, ambas flechas están deshabilitadas y no hay cards de anterior/siguiente', () => {
    const lotes = [makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' })];

    renderList({ lotes, selectedLoteId: 'lote-1' });

    expect(screen.getByRole('button', { name: 'Lote anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lote siguiente' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Ver lote/ })).not.toBeInTheDocument();
  });

  it('navegación circular: desde el primer lote, "Lote anterior" lleva al último', async () => {
    const onSelect = vi.fn();
    const lotes = [
      makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' }),
      makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona' }),
      makeLote({ id: 'lote-3', lot_number: '3', title: 'Novillo' }),
    ];

    renderList({ lotes, selectedLoteId: 'lote-1', onSelect });

    expect(screen.getByRole('button', { name: 'Lote anterior' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Lote anterior' }));

    expect(onSelect).toHaveBeenCalledWith('lote-3');
  });

  it('navegación circular: desde el último lote, "Lote siguiente" lleva al primero', async () => {
    const onSelect = vi.fn();
    const lotes = [
      makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' }),
      makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona' }),
      makeLote({ id: 'lote-3', lot_number: '3', title: 'Novillo' }),
    ];

    renderList({ lotes, selectedLoteId: 'lote-3', onSelect });

    expect(screen.getByRole('button', { name: 'Lote siguiente' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Lote siguiente' }));

    expect(onSelect).toHaveBeenCalledWith('lote-1');
  });

  it('la flecha "Lote siguiente" selecciona el próximo lote', async () => {
    const onSelect = vi.fn();
    const lotes = [
      makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' }),
      makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona' }),
    ];

    renderList({ lotes, selectedLoteId: 'lote-1', onSelect });

    await userEvent.click(screen.getByRole('button', { name: 'Lote siguiente' }));

    expect(onSelect).toHaveBeenCalledWith('lote-2');
  });

  it('un click en la card del siguiente lote lo selecciona directamente', async () => {
    const onSelect = vi.fn();
    const lotes = [
      makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' }),
      makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona' }),
    ];

    renderList({ lotes, selectedLoteId: 'lote-1', onSelect });

    await userEvent.click(screen.getByRole('button', { name: /Vaquillona/ }));

    expect(onSelect).toHaveBeenCalledWith('lote-2');
  });

  it('con 3 lotes y el del medio seleccionado, hay cards de anterior y siguiente', () => {
    const lotes = [
      makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' }),
      makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona' }),
      makeLote({ id: 'lote-3', lot_number: '3', title: 'Novillo' }),
    ];

    renderList({ lotes, selectedLoteId: 'lote-2' });

    expect(screen.getByRole('button', { name: /Ver lote: Lote 1, Toro Angus/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver lote: Lote 3, Novillo/ })).toBeInTheDocument();
  });

  it('con la flecha ArrowDown del teclado, selecciona el siguiente lote', () => {
    const onSelect = vi.fn();
    const lotes = [
      makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus' }),
      makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona' }),
    ];

    renderList({ lotes, selectedLoteId: 'lote-1', onSelect });

    fireEvent.keyDown(screen.getByRole('group', { name: /Selector de lote/ }), { key: 'ArrowDown' });

    expect(onSelect).toHaveBeenCalledWith('lote-2');
  });
});
