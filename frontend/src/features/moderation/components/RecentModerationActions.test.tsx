import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentModerationActions } from './RecentModerationActions';
import type { AuditLogEntry } from '../../audit/types';

const useModerationHistoryMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useModerationHistory: useModerationHistoryMock }));

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'entry-1',
    occurred_at: '2026-07-23T10:00:00Z',
    actor_id: 'rematador-1',
    actor_name: 'Ana Rematadora',
    actor_role: 'rematador',
    action: 'moderacion.usuario_expulsado',
    resource_type: 'user',
    resource_id: 'buyer-1',
    remate_id: 'remate-1',
    details: null,
    ...overrides,
  };
}

describe('RecentModerationActions', () => {
  it('sin acciones, muestra el estado vacío', () => {
    useModerationHistoryMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 10 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    render(<RecentModerationActions remateId="remate-1" />);
    expect(screen.getByText('Sin acciones registradas')).toBeInTheDocument();
  });

  it('muestra la acción y el actor de cada entrada', () => {
    useModerationHistoryMock.mockReturnValue({
      data: { items: [makeEntry()], total: 1, page: 1, page_size: 10 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    render(<RecentModerationActions remateId="remate-1" />);

    expect(screen.getByText('Comprador expulsado')).toBeInTheDocument();
    expect(screen.getByText('Ana Rematadora')).toBeInTheDocument();
  });

  it('ante un error, muestra el mensaje de error', () => {
    useModerationHistoryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: { status: 500, code: 'http_error', message: 'Error.' },
      reload: vi.fn(),
    });
    render(<RecentModerationActions remateId="remate-1" />);
    expect(screen.getByText('No se pudo cargar el historial.')).toBeInTheDocument();
  });
});
