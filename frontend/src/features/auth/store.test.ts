import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  refreshRequest: vi.fn(),
  logoutRequest: vi.fn(),
  fetchCurrentUserRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useAuthStore } = await import('./store');

const USER = {
  id: 'u1',
  email: 'buyer@example.com',
  full_name: 'Compradora Test',
  phone: null,
  avatar_url: null,
  role: 'comprador' as const,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const TOKENS = { access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'bearer' };

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: true,
    });
    localStorage.clear();
  });

  it('login guarda los tokens y el usuario actual', async () => {
    apiMocks.loginRequest.mockResolvedValue(TOKENS);
    apiMocks.fetchCurrentUserRequest.mockResolvedValue(USER);

    await useAuthStore.getState().login({ email: USER.email, password: 'secret123' });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-1');
    expect(state.refreshToken).toBe('refresh-1');
    expect(state.user).toEqual(USER);
  });

  it('login no persiste nada si el request falla', async () => {
    apiMocks.loginRequest.mockRejectedValue(new Error('credenciales inválidas'));

    await expect(
      useAuthStore.getState().login({ email: USER.email, password: 'wrong' }),
    ).rejects.toThrow();

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('register encadena un login con la misma contraseña', async () => {
    apiMocks.registerRequest.mockResolvedValue(USER);
    apiMocks.loginRequest.mockResolvedValue(TOKENS);
    apiMocks.fetchCurrentUserRequest.mockResolvedValue(USER);

    const result = await useAuthStore.getState().register({
      email: USER.email,
      password: 'secret123',
      confirm_password: 'secret123',
      full_name: USER.full_name,
      phone: '+5491100000000',
      role: 'comprador',
    });

    expect(result).toEqual({ pendingApproval: false });
    expect(apiMocks.loginRequest).toHaveBeenCalledWith({
      email: USER.email,
      password: 'secret123',
    });
    expect(useAuthStore.getState().user).toEqual(USER);
  });

  it('register no encadena login para empresa/rematador pendientes de aprobación (is_active=false)', async () => {
    const PENDING_EMPRESA = { ...USER, role: 'empresa' as const, is_active: false };
    apiMocks.registerRequest.mockResolvedValue(PENDING_EMPRESA);

    const result = await useAuthStore.getState().register({
      email: USER.email,
      password: 'secret123',
      confirm_password: 'secret123',
      full_name: USER.full_name,
      phone: '+5491100000000',
      role: 'empresa',
    });

    expect(result).toEqual({ pendingApproval: true });
    expect(apiMocks.loginRequest).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('logout limpia el estado local incluso si la llamada al backend falla', async () => {
    useAuthStore.setState({ user: USER, accessToken: 'a', refreshToken: 'r', isHydrated: true });
    apiMocks.logoutRequest.mockRejectedValue(new Error('red caída'));

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.justLoggedOut).toBe(true);
  });

  it('clearJustLoggedOut apaga el flag que RequireAuth consume para mandar a /login tras un logout', () => {
    useAuthStore.setState({ justLoggedOut: true });

    useAuthStore.getState().clearJustLoggedOut();

    expect(useAuthStore.getState().justLoggedOut).toBe(false);
  });

  it('login apaga justLoggedOut de una sesión anterior', async () => {
    useAuthStore.setState({ justLoggedOut: true });
    apiMocks.loginRequest.mockResolvedValue({ access_token: 'a', refresh_token: 'r' });
    apiMocks.fetchCurrentUserRequest.mockResolvedValue(USER);

    await useAuthStore.getState().login({ email: 'x@x.com', password: 'x' });

    expect(useAuthStore.getState().justLoggedOut).toBe(false);
  });

  it('refreshSession actualiza ambos tokens y devuelve el access token nuevo', async () => {
    useAuthStore.setState({ refreshToken: 'old-refresh', isHydrated: true });
    apiMocks.refreshRequest.mockResolvedValue({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      token_type: 'bearer',
    });

    const newAccessToken = await useAuthStore.getState().refreshSession();

    expect(newAccessToken).toBe('access-2');
    expect(useAuthStore.getState().accessToken).toBe('access-2');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
  });

  it('refreshSession lanza si no hay sesión activa', async () => {
    useAuthStore.setState({ refreshToken: null, isHydrated: true });

    await expect(useAuthStore.getState().refreshSession()).rejects.toThrow(
      'No hay sesión activa',
    );
    expect(apiMocks.refreshRequest).not.toHaveBeenCalled();
  });
});
