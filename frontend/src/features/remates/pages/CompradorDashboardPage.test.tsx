import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CompradorDashboardPage } from './CompradorDashboardPage';
import type { Remate } from '../types';
import type { Page } from '../../../shared/api/types';
import type { PostAuctionCase } from '../../postauction/types';

const { useRematesMock, useLoteCountMock, useMisComprasMock } = vi.hoisted(() => ({
  useRematesMock: vi.fn(),
  useLoteCountMock: vi.fn(),
  useMisComprasMock: vi.fn(() => ({
    data: null as Page<PostAuctionCase> | null,
    isLoading: false,
    error: null,
    reload: vi.fn(),
  })),
}));

vi.mock('../hooks', () => ({
  useRemates: useRematesMock,
  useLoteCount: useLoteCountMock,
}));
vi.mock('../../postauction/hooks', () => ({ useMisCompras: useMisComprasMock }));
vi.mock('../../notifications/components/RecentActivityCard', () => ({
  RecentActivityCard: () => null,
}));

function makeRemate(overrides: Partial<Remate>): Remate {
  return {
    id: 'id-1',
    owner_id: 'owner-1',
    title: 'Remate genérico',
    description: null,
    category: 'otros',
    cover_image_url: null,
    location: null,
    starts_at: '2026-08-01T10:00:00Z',
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

function renderPage() {
  return render(
    <MemoryRouter>
      <CompradorDashboardPage />
    </MemoryRouter>,
  );
}

describe('CompradorDashboardPage', () => {
  it('mientras carga, muestra esqueletos y no la grilla ni un error', () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ver remate')).not.toBeInTheDocument();
  });

  it('ante un error, lo muestra junto con un botón para reintentar', async () => {
    useLoteCountMock.mockReturnValue(0);
    const reload = vi.fn();
    useRematesMock.mockReturnValue({
      remates: [],
      isLoading: false,
      error: { status: null, code: 'network_error', message: 'No se pudo conectar con el servidor.' },
      reload,
    });

    renderPage();
    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sin remates, muestra el estado vacío "todavía no hay remates"', () => {
    useLoteCountMock.mockReturnValue(0);
    useRematesMock.mockReturnValue({ remates: [], isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Todavía no hay remates disponibles')).toBeInTheDocument();
  });

  it('con remates, renderiza una tarjeta por cada uno (sin tabla)', () => {
    useLoteCountMock.mockReturnValue(2);
    useRematesMock.mockReturnValue({
      remates: [
        makeRemate({ id: 'a', title: 'Remate A' }),
        makeRemate({ id: 'b', title: 'Remate B' }),
      ],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Remate A')).toBeInTheDocument();
    expect(screen.getByText('Remate B')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('si la búsqueda no matchea nada, muestra el estado vacío de filtros con opción de limpiarlos', async () => {
    useLoteCountMock.mockReturnValue(0);
    useRematesMock.mockReturnValue({
      remates: [makeRemate({ id: 'a', title: 'Remate A' })],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    await userEvent.type(screen.getByLabelText('Buscar remates por título'), 'no existe');

    expect(screen.getByText('Ningún remate coincide con tu búsqueda')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('Remate A')).toBeInTheDocument();
  });

  it('la fila de KPIs cuenta próximos/en vivo sobre la lista, y lotes ganados desde useMisCompras', () => {
    useLoteCountMock.mockReturnValue(0);
    useRematesMock.mockReturnValue({
      remates: [
        makeRemate({ id: 'a', status: 'scheduled' }),
        makeRemate({ id: 'b', status: 'scheduled' }),
        makeRemate({ id: 'c', status: 'live' }),
        makeRemate({ id: 'd', status: 'finished' }),
      ],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useMisComprasMock.mockReturnValue({
      data: { items: [], total: 5, page: 1, page_size: 1 },
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Próximos remates').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Remates en vivo').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Lotes ganados').nextElementSibling?.textContent).toBe('5');
  });
});
