import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RemateDetailPage } from './RemateDetailPage';
import type { Lote, Remate } from '../types';

const { navigateMock, useRemateDetailMock, useLotesMock, useAuthMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useRemateDetailMock: vi.fn(),
  useLotesMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ remateId: 'remate-1' }),
  };
});

vi.mock('../hooks', () => ({
  useRemateDetail: useRemateDetailMock,
  useLotes: useLotesMock,
}));

vi.mock('../../auth/hooks', () => ({ useAuth: useAuthMock }));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: 'Hacienda de primera calidad.',
    category: 'hacienda',
    cover_image_url: null,
    location: 'Pergamino, Buenos Aires',
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: null,
    status: 'scheduled',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeLote(id: string): Lote {
  return {
    id,
    remate_id: 'remate-1',
    lot_number: id,
    display_order: 0,
    title: `Título del lote ${id}`,
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RemateDetailPage />
    </MemoryRouter>,
  );
}

describe('RemateDetailPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
  });

  it('mientras carga el remate, muestra esqueletos y no el contenido', () => {
    useRemateDetailMock.mockReturnValue({ remate: null, isLoading: true, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Entrar al remate')).not.toBeInTheDocument();
  });

  it('si el remate no se pudo cargar, muestra el error con reintentar y volver al dashboard', async () => {
    const reloadRemate = vi.fn();
    useRemateDetailMock.mockReturnValue({
      remate: null,
      isLoading: false,
      error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' },
      reload: reloadRemate,
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Remate no encontrado.')).toBeInTheDocument();
    // Con sesión iniciada, no tiene sentido ofrecer "Iniciar sesión" -- este error no se
    // resuelve logueándose de nuevo.
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reloadRemate).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('sin sesión, el error de acceso también ofrece "Iniciar sesión" (grant de remate privado persistente, sesión perdida)', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false });
    useRemateDetailMock.mockReturnValue({
      remate: null,
      isLoading: false,
      error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' },
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('con el remate cargado, muestra su información y la cantidad de lotes', () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate(),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({
      lotes: [makeLote('1'), makeLote('2')],
      total: 2,
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('Pergamino, Buenos Aires')).toBeInTheDocument();
    expect(screen.getByText('Hacienda de primera calidad.')).toBeInTheDocument();
    expect(screen.getByText('Título del lote 1')).toBeInTheDocument();
    expect(screen.getByText('Título del lote 2')).toBeInTheDocument();
  });

  it('sin lotes cargados, muestra el estado vacío del listado', () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate(),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Este remate todavía no tiene lotes cargados')).toBeInTheDocument();
  });

  it('si fallan los lotes, muestra su propio error sin ocultar el resto del remate', async () => {
    const reloadLotes = vi.fn();
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate(),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({
      lotes: [],
      total: 0,
      isLoading: false,
      error: { status: 500, code: 'http_error', message: 'Error inesperado del servidor (500).' },
      reload: reloadLotes,
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('Error inesperado del servidor (500).')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reloadLotes).toHaveBeenCalledTimes(1);
  });

  it('"Entrar al remate" en un remate "live" navega directo a la sala', async () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({ status: 'live' }),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));
    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-1/sala');
  });

  it('"Entrar al remate" en un remate "scheduled" muestra el cartel de "todavía no empezó" en vez de navegar', async () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({ status: 'scheduled', starts_at: '2026-09-01T14:00:00Z' }),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();
    // `navigateMock` es compartido entre los tests de este archivo (sin `beforeEach`
    // que lo limpie) -- lo que importa acá es que NO se sume un llamado nuevo a la
    // sala de ESTE remate, no que el mock esté "virgen".
    const callsBeforeClick = navigateMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(navigateMock.mock.calls.length).toBe(callsBeforeClick);
    expect(screen.getByRole('heading', { name: 'Todavía no empezó' })).toBeInTheDocument();
    expect(screen.getByText(/todavía no está en vivo/i)).toBeInTheDocument();

    // "Continuar" solo cierra el cartel -- se queda en el Detalle, sin navegar.
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Todavía no empezó' })).not.toBeInTheDocument(),
    );
    expect(navigateMock.mock.calls.length).toBe(callsBeforeClick);
  });
});
