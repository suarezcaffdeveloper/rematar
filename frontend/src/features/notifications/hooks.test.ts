import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Notification } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchNotificationsRequest: vi.fn(),
  fetchUnreadNotificationCountRequest: vi.fn(),
  markNotificationReadRequest: vi.fn(),
  markAllNotificationsReadRequest: vi.fn(),
}));
vi.mock('./api', () => apiMocks);

const { useNotifications, useUnreadNotificationCount } = await import('./hooks');

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    created_at: '2026-07-23T10:00:00Z',
    type: 'postauction.case_created',
    title: '¡Ganaste un lote!',
    message: 'Se te adjudicó un lote.',
    resource_type: 'postauction_case',
    resource_id: 'case-1',
    remate_id: 'remate-1',
    read_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNotifications', () => {
  it('carga las últimas notificaciones', async () => {
    apiMocks.fetchNotificationsRequest.mockResolvedValue({
      items: [makeNotification()],
      total: 1,
      page: 1,
      page_size: 5,
    });

    const { result } = renderHook(() => useNotifications(5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.items).toHaveLength(1);
    expect(apiMocks.fetchNotificationsRequest).toHaveBeenCalledWith(1, 5);
  });

  it('markAsRead llama al backend y recarga la lista', async () => {
    apiMocks.fetchNotificationsRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 5 });
    apiMocks.markNotificationReadRequest.mockResolvedValue(makeNotification({ read_at: '2026-07-23T10:05:00Z' }));

    const { result } = renderHook(() => useNotifications(5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.markAsRead('n-1');

    expect(apiMocks.markNotificationReadRequest).toHaveBeenCalledWith('n-1');
    await waitFor(() => expect(apiMocks.fetchNotificationsRequest).toHaveBeenCalledTimes(2));
  });

  it('markAllAsRead llama al backend y recarga la lista', async () => {
    apiMocks.fetchNotificationsRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 5 });
    apiMocks.markAllNotificationsReadRequest.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications(5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.markAllAsRead();

    expect(apiMocks.markAllNotificationsReadRequest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(apiMocks.fetchNotificationsRequest).toHaveBeenCalledTimes(2));
  });
});

describe('useUnreadNotificationCount', () => {
  it('expone el conteo de no leídas', async () => {
    apiMocks.fetchUnreadNotificationCountRequest.mockResolvedValue({ unread_count: 3 });

    const { result } = renderHook(() => useUnreadNotificationCount());

    await waitFor(() => expect(result.current.unreadCount).toBe(3));
  });
});
