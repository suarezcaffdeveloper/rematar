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
});
