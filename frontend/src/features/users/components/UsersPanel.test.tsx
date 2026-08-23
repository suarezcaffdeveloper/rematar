import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { User } from '../../auth/types';

const useUsersListMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useUsersList: useUsersListMock }));

const apiMocks = vi.hoisted(() => ({
  updateUserStatusRequest: vi.fn(),
}));
vi.mock('../api', () => apiMocks);

const { UsersPanel } = await import('./UsersPanel');

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'empresa@example.com',
    full_name: 'Empresa Test',
    phone: null,
    avatar_url: null,
    role: 'empresa',
    is_active: false,
    created_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

function mockList(items: User[], overrides: Partial<ReturnType<typeof useUsersListMock>> = {}) {
  useUsersListMock.mockReturnValue({
    data: { items, total: items.length, page: 1, page_size: 20 },
    isLoading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  });
}

describe('UsersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('una cuenta empresa pendiente muestra el badge "Pendiente" y el botón "Aprobar"', () => {
    mockList([makeUser()]);
    render(<UsersPanel />);

    expect(screen.getByText('Empresa Test')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument();
  });

  it('una cuenta activa muestra "Activo" y el botón "Suspender"', () => {
    mockList([makeUser({ is_active: true })]);
    render(<UsersPanel />);

    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suspender/i })).toBeInTheDocument();
  });

  it('una cuenta comprador inactiva se etiqueta "Suspendido", no "Pendiente"', () => {
    mockList([makeUser({ role: 'comprador', is_active: false })]);
    render(<UsersPanel />);

    expect(screen.getByText('Suspendido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reactivar/i })).toBeInTheDocument();
  });

  it('aprobar llama a updateUserStatusRequest(id, true) y recarga', async () => {
    const reload = vi.fn();
    apiMocks.updateUserStatusRequest.mockResolvedValue(undefined);
    mockList([makeUser()], { reload });

    render(<UsersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /aprobar/i }));

    await waitFor(() => {
      expect(apiMocks.updateUserStatusRequest).toHaveBeenCalledWith('user-1', true);
    });
    expect(reload).toHaveBeenCalled();
  });

  it('suspender pide confirmación antes de llamar a la API', async () => {
    const reload = vi.fn();
    apiMocks.updateUserStatusRequest.mockResolvedValue(undefined);
    mockList([makeUser({ is_active: true })], { reload });

    render(<UsersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /suspender/i }));

    expect(apiMocks.updateUserStatusRequest).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Suspender cuenta' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));

    await waitFor(() => {
      expect(apiMocks.updateUserStatusRequest).toHaveBeenCalledWith('user-1', false);
    });
    expect(reload).toHaveBeenCalled();
  });

  it('sin usuarios, muestra el estado vacío', () => {
    mockList([]);
    render(<UsersPanel />);

    expect(screen.getByText('Sin usuarios')).toBeInTheDocument();
  });

  it('ante un error de carga, muestra el mensaje de error', () => {
    useUsersListMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
      isLoading: false,
      error: { status: 500, code: 'http_error', message: 'Error.' },
      reload: vi.fn(),
    });
    render(<UsersPanel />);

    expect(screen.getByText('No se pudo cargar la lista de usuarios.')).toBeInTheDocument();
  });
});
