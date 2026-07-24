import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RecentActivityCard } from './RecentActivityCard';
import type { Notification } from '../types';

const { useNotificationsMock } = vi.hoisted(() => ({ useNotificationsMock: vi.fn() }));
vi.mock('../hooks', () => ({ useNotifications: useNotificationsMock }));

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    created_at: '2026-07-23T10:00:00Z',
    type: 'postauction.status_changed',
    title: 'Cambio de estado',
    message: 'Tu compra pasó a "Pago recibido".',
    resource_type: 'postauction_case',
    resource_id: 'case-1',
    remate_id: 'remate-1',
    read_at: null,
    ...overrides,
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <RecentActivityCard />
    </MemoryRouter>,
  );
}

describe('RecentActivityCard', () => {
  it('mientras carga, muestra esqueletos', () => {
    useNotificationsMock.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    const { container } = renderCard();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('sin actividad, muestra el estado vacío', () => {
    useNotificationsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 5 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    renderCard();

    expect(screen.getByText('Todavía no hay actividad reciente.')).toBeInTheDocument();
  });

  it('con actividad, renderiza cada notificación con link al remate', () => {
    useNotificationsMock.mockReturnValue({
      data: { items: [makeNotification()], total: 1, page: 1, page_size: 5 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    });

    renderCard();

    expect(screen.getByText('Cambio de estado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cambio de estado/ })).toHaveAttribute('href', '/remates/remate-1');
  });

  it('clickear una notificación no leída la marca como leída', async () => {
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    useNotificationsMock.mockReturnValue({
      data: { items: [makeNotification()], total: 1, page: 1, page_size: 5 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
      markAsRead,
      markAllAsRead: vi.fn(),
    });

    renderCard();
    await userEvent.click(screen.getByRole('link', { name: /Cambio de estado/ }));

    expect(markAsRead).toHaveBeenCalledWith('n-1');
  });
});
