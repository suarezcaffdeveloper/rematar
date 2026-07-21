import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
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
    loteCount: 3,
    onEdit: vi.fn(),
    onPublish: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onViewAudit: vi.fn(),
    isPublishing: false,
    isDuplicating: false,
    ...overrides,
  };
}

describe('RemateManagementSidebar', () => {
  it('remate "draft" sin fecha: Publicar deshabilitado, Eliminar disponible', () => {
    render(<RemateManagementSidebar {...baseProps()} />);
    expect(screen.getByRole('button', { name: /Publicar remate/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Eliminar remate/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Editar remate/ })).toBeEnabled();
  });

  it('remate "draft" con fecha: Publicar habilitado', () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ starts_at: '2026-08-01T14:00:00Z' }) })} />);
    expect(screen.getByRole('button', { name: /Publicar remate/ })).toBeEnabled();
  });

  it('remate "scheduled": sin botón de Publicar ni de Eliminar, Editar y Cancelar disponibles', () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ status: 'scheduled' }) })} />);
    expect(screen.queryByRole('button', { name: /Publicar remate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar remate/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar remate/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar remate' })).toBeInTheDocument();
  });

  it('remate "live": Editar deshabilitado, sin Eliminar ni Publicar, Cancelar disponible', () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ status: 'live' }) })} />);
    expect(screen.getByRole('button', { name: /Editar remate/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Publicar remate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar remate/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar remate' })).toBeInTheDocument();
  });

  it('remate "finished": sin Cancelar, sin Eliminar, sin Publicar -- Duplicar sigue disponible', () => {
    render(<RemateManagementSidebar {...baseProps({ remate: makeRemate({ status: 'finished' }) })} />);
    expect(screen.queryByRole('button', { name: 'Cancelar remate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar remate/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duplicar remate/ })).toBeEnabled();
  });

  it('muestra la cantidad de lotes y la ubicación', () => {
    render(<RemateManagementSidebar {...baseProps({ loteCount: 5 })} />);
    expect(screen.getByText('5 lotes cargados')).toBeInTheDocument();
    expect(screen.getByText('Pergamino')).toBeInTheDocument();
  });
});
