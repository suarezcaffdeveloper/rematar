import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OperatorClaimPage } from './OperatorClaimPage';
import type { Remate } from '../../remates/types';

const { navigateMock, useAuthMock, useRematesMock, apiMocks } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useRematesMock: vi.fn(),
  apiMocks: { claimOperatorRequest: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../auth/hooks', () => ({ useAuth: useAuthMock }));
vi.mock('../../remates/hooks', () => ({ useRemates: useRematesMock }));
vi.mock('../../remates/api', () => apiMocks);

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    rematador_id: 'me',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-07-18T10:00:00Z',
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Remate;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OperatorClaimPage />
    </MemoryRouter>,
  );
}

describe('OperatorClaimPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'me', role: 'rematador' } });
  });

  it('mientras carga, no muestra ni el formulario ni la tarjeta de asignación', () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.queryByText('Unirme como operador')).not.toBeInTheDocument();
    expect(screen.queryByText('Volver a la consola operativa')).not.toBeInTheDocument();
  });

  it('sin ningún remate asignado, muestra el formulario de canje', () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Unirme como operador')).toBeInTheDocument();
  });

  it('con un remate asignado activo, muestra la tarjeta en vez del formulario', () => {
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ status: 'live' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Remate de hacienda')).toBeInTheDocument();
    expect(screen.getByText('En vivo')).toBeInTheDocument();
    expect(screen.queryByText('Unirme como operador')).not.toBeInTheDocument();
  });

  it('un remate ya finalizado no cuenta como asignación vigente -- sigue mostrando el formulario', () => {
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ status: 'finished' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Unirme como operador')).toBeInTheDocument();
  });

  it('si falla el chequeo de asignación, degrada al formulario en vez de bloquear la pantalla', () => {
    useRematesMock.mockReturnValue({
      remates: [],
      isLoading: false,
      error: { status: 500, code: 'network_error', message: 'falló' },
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Unirme como operador')).toBeInTheDocument();
  });

  it('"Volver a la consola operativa" navega directo a /gestionar del remate asignado', async () => {
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'remate-42', status: 'paused' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la consola operativa' }));

    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-42/gestionar');
  });

  it('canjear un código válido navega a la consola operativa de ese remate', async () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });
    apiMocks.claimOperatorRequest.mockResolvedValue(makeRemate({ id: 'remate-7' }));

    renderPage();
    await userEvent.type(screen.getByLabelText('ID del remate'), 'remate-7');
    await userEvent.type(screen.getByLabelText('Código de operador'), 'a3k7p2qx');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar a la Consola Operativa' }));

    expect(apiMocks.claimOperatorRequest).toHaveBeenCalledWith('remate-7', 'A3K7P2QX');
    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-7/gestionar');
  });

  it('canjear un código inválido muestra el error sin navegar', async () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });
    apiMocks.claimOperatorRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'Código de operador inválido.' } } },
    });

    renderPage();
    await userEvent.type(screen.getByLabelText('ID del remate'), 'remate-7');
    await userEvent.type(screen.getByLabelText('Código de operador'), 'BADCODE1');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar a la Consola Operativa' }));

    expect(await screen.findByText('Código de operador inválido.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
