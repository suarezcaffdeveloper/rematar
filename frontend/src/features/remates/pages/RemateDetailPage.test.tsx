import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RemateDetailPage } from './RemateDetailPage';
import type { Lote, Remate } from '../types';

const { navigateMock, useRemateDetailMock, useLotesMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useRemateDetailMock: vi.fn(),
  useLotesMock: vi.fn(),
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
    images: [],
    quantity: 1,
    unit_label: null,
    status: 'pending',
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

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reloadRemate).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
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
    expect(screen.getByText('2 lotes')).toBeInTheDocument();
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

  it('"Entrar al remate" navega a la sala placeholder de ESE remate', async () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate(),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));
    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-1/sala');
  });
});
