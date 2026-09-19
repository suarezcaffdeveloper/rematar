import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardToolbar } from './DashboardToolbar';
import { ALL_STATUS_OPTIONS, VISIBLE_STATUS_OPTIONS } from '../labels';
import { DEFAULT_FILTERS } from '../filtering';

describe('DashboardToolbar', () => {
  it('sin statusOptions, no ofrece "Borrador" (default VISIBLE_STATUS_OPTIONS, comprador)', () => {
    render(<DashboardToolbar filters={DEFAULT_FILTERS} onChange={vi.fn()} />);

    const select = within(screen.getByLabelText('Filtrar por estado'));
    expect(select.queryByText('Borrador')).not.toBeInTheDocument();
    expect(select.getByText('En vivo')).toBeInTheDocument();
    expect(VISIBLE_STATUS_OPTIONS).not.toContain('draft');
  });

  it('con statusOptions=ALL_STATUS_OPTIONS, sí ofrece "Borrador" (rematador)', async () => {
    const onChange = vi.fn();
    render(<DashboardToolbar filters={DEFAULT_FILTERS} onChange={onChange} statusOptions={ALL_STATUS_OPTIONS} />);

    const select = within(screen.getByLabelText('Filtrar por estado'));
    expect(select.getByText('Borrador')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'draft');
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'draft' });
  });

  it('sin showAuctionTypeFilter, no renderiza el filtro de tipo (layout original categoría/estado/orden)', () => {
    render(<DashboardToolbar filters={DEFAULT_FILTERS} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Filtrar por tipo de remate')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por categoría')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por estado')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar remates')).toBeInTheDocument();
  });

  it('con showAuctionTypeFilter, reemplaza el filtro de estado por el de tipo (comprador)', async () => {
    const onChange = vi.fn();
    render(<DashboardToolbar filters={DEFAULT_FILTERS} onChange={onChange} showAuctionTypeFilter />);

    // El filtro de estado desaparece; el de tipo aparece con las tres opciones pedidas.
    expect(screen.queryByLabelText('Filtrar por estado')).not.toBeInTheDocument();
    const typeSelect = within(screen.getByLabelText('Filtrar por tipo de remate'));
    expect(typeSelect.getByText('Todo tipo de remate')).toBeInTheDocument();
    expect(typeSelect.getByText('Remate en vivo')).toBeInTheDocument();
    expect(typeSelect.getByText('Remate timed auction')).toBeInTheDocument();

    // La categoría sigue existiendo (pasa a la columna del medio).
    expect(screen.getByLabelText('Filtrar por categoría')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por tipo de remate'), 'timed');
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, auctionType: 'timed' });
  });
});
