import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import type { Notification } from '../types';

const { useNotificationsMock, useUnreadNotificationCountMock } = vi.hoisted(() => ({
  useNotificationsMock: vi.fn(),
  useUnreadNotificationCountMock: vi.fn(),
}));
vi.mock('../hooks', () => ({
  useNotifications: useNotificationsMock,
  useUnreadNotificationCount: useUnreadNotificationCountMock,
}));

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

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe('NotificationBell', () => {
  it('sin no leídas, no muestra el badge', () => {
    useUnreadNotificationCountMock.mockReturnValue({ unreadCount: 0, reload: vi.fn() });
    useNotificationsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 8 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    renderBell();

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('con no leídas, muestra el badge con el conteo', () => {
    useUnreadNotificationCountMock.mockReturnValue({ unreadCount: 3, reload: vi.fn() });
    useNotificationsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 8 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    renderBell();

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('al abrir, muestra las notificaciones recientes', async () => {
    useUnreadNotificationCountMock.mockReturnValue({ unreadCount: 1, reload: vi.fn() });
    useNotificationsMock.mockReturnValue({
      data: { items: [makeNotification()], total: 1, page: 1, page_size: 8 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    renderBell();
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));

    expect(screen.getByText('¡Ganaste un lote!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ganaste un lote/ })).toHaveAttribute('href', '/mis-compras');
  });

  it('sin notificaciones, muestra el estado vacío', async () => {
    useUnreadNotificationCountMock.mockReturnValue({ unreadCount: 0, reload: vi.fn() });
    useNotificationsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 8 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    renderBell();
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));

    expect(screen.getByText('No tenés notificaciones.')).toBeInTheDocument();
  });

  it('clickear una notificación no leída la marca como leída', async () => {
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    const reloadUnread = vi.fn();
    useUnreadNotificationCountMock.mockReturnValue({ unreadCount: 1, reload: reloadUnread });
    useNotificationsMock.mockReturnValue({
      data: { items: [makeNotification()], total: 1, page: 1, page_size: 8 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead,
      markAllAsRead: vi.fn(),
    });

    renderBell();
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    await userEvent.click(screen.getByRole('link', { name: /Ganaste un lote/ }));

    expect(markAsRead).toHaveBeenCalledWith('n-1');
  });

  it('marcar todas como leídas llama a markAllAsRead', async () => {
    const markAllAsRead = vi.fn().mockResolvedValue(undefined);
    useUnreadNotificationCountMock.mockReturnValue({ unreadCount: 2, reload: vi.fn() });
    useNotificationsMock.mockReturnValue({
      data: { items: [makeNotification()], total: 1, page: 1, page_size: 8 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead,
    });

    renderBell();
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));

    expect(markAllAsRead).toHaveBeenCalledTimes(1);
  });
});
