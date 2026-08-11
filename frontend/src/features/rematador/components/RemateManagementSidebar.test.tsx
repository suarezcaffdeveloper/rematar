import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemateManagementSidebar } from './RemateManagementSidebar';
import type { Remate } from '../../remates/types';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: 'Pergamino',
    starts_at: null,
    ends_at: null,
    status: 'draft',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof RemateManagementSidebar>[0]> = {}) {
  return {
    remate: makeRemate(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onViewAudit: vi.fn(),
    isDuplicating: false,
    ...overrides,
  };
}

async function openConfigMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Configuración del remate' }));
}

describe('RemateManagementSidebar', () => {
  it('muestra estado, categoría, título y fecha de inicio', () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ starts_at: '2026-08-01T14:00:00Z' }) })} />);
    expect(screen.getByText('Remate de hacienda')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('remate "draft": Editar habilitado, Eliminar disponible en el menú de configuración', async () => {
    render(<RemateManagementSidebar {...baseProps()} />);
    await openConfigMenu();
    expect(screen.getByRole('menuitem', { name: 'Editar remate' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'Eliminar remate' })).toBeInTheDocument();
  });

  it('remate "scheduled": sin "Eliminar remate", Editar y Cancelar disponibles', async () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ status: 'scheduled' }) })} />);
    await openConfigMenu();
    expect(screen.queryByRole('menuitem', { name: 'Eliminar remate' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Editar remate' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'Cancelar remate' })).toBeInTheDocument();
  });

  it('remate "live": Editar deshabilitado, sin Eliminar, Cancelar disponible', async () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ status: 'live' }) })} />);
    await openConfigMenu();
    expect(screen.getByRole('menuitem', { name: 'Editar remate' })).toBeDisabled();
    expect(screen.queryByRole('menuitem', { name: 'Eliminar remate' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cancelar remate' })).toBeInTheDocument();
  });

  it('remate "finished": sin Cancelar, sin Eliminar -- Duplicar sigue disponible', async () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ status: 'finished' }) })} />);
    await openConfigMenu();
    expect(screen.queryByRole('menuitem', { name: 'Cancelar remate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Eliminar remate' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Duplicar remate' })).toBeEnabled();
  });

  it('las acciones del menú llaman a sus callbacks', async () => {
    const props = baseProps();
    render(<RemateManagementSidebar {...props} />);

    await openConfigMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar remate' }));
    expect(props.onEdit).toHaveBeenCalledTimes(1);

    await openConfigMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar remate' }));
    expect(props.onDuplicate).toHaveBeenCalledTimes(1);

    await openConfigMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ver auditoría' }));
    expect(props.onViewAudit).toHaveBeenCalledTimes(1);

    await openConfigMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancelar remate' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);

    await openConfigMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar remate' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });
});
