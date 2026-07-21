import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Page } from '../../shared/api/types';
import type { AuditLogEntry, AuditLogFilters } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchGlobalAuditLogRequest: vi.fn(),
  fetchRemateAuditLogRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useAuditLog } = await import('./hooks');

function makePage(overrides: Partial<Page<AuditLogEntry>> = {}): Page<AuditLogEntry> {
  return {
    items: [
      {
        id: 'entry-1',
        occurred_at: '2026-07-21T10:00:00Z',
        actor_id: 'user-1',
        actor_name: 'Ana Rematadora',
        actor_role: 'rematador',
        action: 'remate.created',
        resource_type: 'remate',
        resource_id: 'remate-1',
        remate_id: 'remate-1',
        details: null,
      },
    ],
    total: 1,
    page: 1,
    page_size: 25,
    ...overrides,
  };
}

describe('useAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchGlobalAuditLogRequest.mockResolvedValue(makePage());
    apiMocks.fetchRemateAuditLogRequest.mockResolvedValue(makePage());
  });

  it('scope global llama a fetchGlobalAuditLogRequest, no al scoped', async () => {
    const { result } = renderHook(() => useAuditLog({ type: 'global' }, { sort: 'desc' }, 1, 25));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.total).toBe(1);
    expect(apiMocks.fetchGlobalAuditLogRequest).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchRemateAuditLogRequest).not.toHaveBeenCalled();
  });

  it('scope remate llama a fetchRemateAuditLogRequest con el remateId', async () => {
    const { result } = renderHook(() =>
      useAuditLog({ type: 'remate', remateId: 'remate-9' }, { sort: 'desc' }, 1, 25),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(apiMocks.fetchRemateAuditLogRequest).toHaveBeenCalledWith(
      'remate-9',
      expect.objectContaining({ sort: 'desc' }),
      1,
      25,
    );
    expect(apiMocks.fetchGlobalAuditLogRequest).not.toHaveBeenCalled();
  });

  it('cambiar un filtro dispara un nuevo fetch', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useAuditLog({ type: 'global' }, filters, 1, 25),
      { initialProps: { filters: { sort: 'desc' } as AuditLogFilters } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    apiMocks.fetchGlobalAuditLogRequest.mockClear();

    rerender({ filters: { sort: 'desc', action: 'remate.created' } as AuditLogFilters });

    await waitFor(() => expect(apiMocks.fetchGlobalAuditLogRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.fetchGlobalAuditLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remate.created' }),
      1,
      25,
    );
  });

  it('cambiar de página dispara un nuevo fetch con el offset correspondiente', async () => {
    const { result, rerender } = renderHook(
      ({ page }) => useAuditLog({ type: 'global' }, { sort: 'desc' }, page, 25),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    apiMocks.fetchGlobalAuditLogRequest.mockClear();

    rerender({ page: 2 });

    await waitFor(() => expect(apiMocks.fetchGlobalAuditLogRequest).toHaveBeenCalledWith(expect.anything(), 2, 25));
  });

  it('un error se expone en error y data queda en null', async () => {
    apiMocks.fetchGlobalAuditLogRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'No tenés acceso.' } } },
    });

    const { result } = renderHook(() => useAuditLog({ type: 'global' }, { sort: 'desc' }, 1, 25));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('No tenés acceso.');
    expect(result.current.data).toBeNull();
  });
});
