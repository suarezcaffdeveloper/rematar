import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { CompradorDashboardPage } from './CompradorDashboardPage';
import type { Remate } from '../types';

const { useRematesMock, useLoteCountMock, useLoteCoverImagesMock, useRemateLiveSnapshotMock } = vi.hoisted(() => ({
  useRematesMock: vi.fn(),
  useLoteCountMock: vi.fn(),
  useLoteCoverImagesMock: vi.fn(() => []),
  useRemateLiveSnapshotMock: vi.fn(() => null),
}));

vi.mock('../hooks', () => ({
  useRemates: useRematesMock,
  useLoteCount: useLoteCountMock,
  useLoteCoverImages: useLoteCoverImagesMock,
  useRemateLiveSnapshot: useRemateLiveSnapshotMock,
}));

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isTopNav: false });
  });
});

function makeRemate(overrides: Partial<Remate>): Remate {
  return {
    id: 'id-1',
    owner_id: 'owner-1',
    title: 'Remate genérico',
    description: null,
    category: 'mercaderia_e_indumentaria',
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

function mockRemates(remates: Remate[]) {
  useLoteCountMock.mockReturnValue(2);
  useRematesMock.mockReturnValue({ remates, isLoading: false, error: null, reload: vi.fn() });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CompradorDashboardPage />
    </MemoryRouter>,
  );
}

describe('CompradorDashboardPage', () => {
  it('mientras carga, muestra esqueletos y no la galería, el mosaico ni un error', () => {
    useRematesMock.mockReturnValue({ remates: [], isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Remates en vivo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Explorá por rubro')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    mockRemates([]);

    renderPage();

    expect(screen.getByText('Todavía no hay remates disponibles')).toBeInTheDocument();
    expect(screen.queryByText('Explorá por rubro')).not.toBeInTheDocument();
  });

  it('con remates, renderiza una fila por cada uno (sin tabla)', () => {
    mockRemates([makeRemate({ id: 'a', title: 'Remate A' }), makeRemate({ id: 'b', title: 'Remate B' })]);

    renderPage();

    expect(screen.getByText('Remate A')).toBeInTheDocument();
    expect(screen.getByText('Remate B')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('si la búsqueda no matchea nada, muestra el estado vacío de filtros con opción de limpiarlos', async () => {
    mockRemates([makeRemate({ id: 'a', title: 'Remate A' })]);

    renderPage();

    await userEvent.type(screen.getByLabelText('Buscar remates por título'), 'no existe');

    expect(screen.getByText('Ningún remate coincide con tu búsqueda')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('Remate A')).toBeInTheDocument();
  });

  it('le pide a AppLayout la barra superior mientras está montada y la suelta al salir', () => {
    mockRemates([]);

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(false);
  });

  it('con un remate en vivo, muestra la galería con el título en singular y el link a la sala', () => {
    mockRemates([makeRemate({ id: 'live-1', title: 'Hacienda en vivo', status: 'live', category: 'hacienda' })]);

    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '1 remate suena el martillo ahora mismo' }),
    ).toBeInTheDocument();
    const gallery = screen.getByRole('region', { name: 'Remates en vivo' });
    expect(within(gallery).getByRole('link', { name: /Entrar a la sala/ })).toHaveAttribute(
      'href',
      '/remates/live-1/sala',
    );
  });

  it('con varios en vivo, el título va en plural', () => {
    mockRemates([
      makeRemate({ id: 'l1', title: 'Vivo 1', status: 'live' }),
      makeRemate({ id: 'l2', title: 'Vivo 2', status: 'live' }),
    ]);

    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '2 remates suenan el martillo ahora mismo' }),
    ).toBeInTheDocument();
  });

  it('con más remates en vivo que paneles, avisa cuántos se muestran y manda al resto a la lista', () => {
    mockRemates(Array.from({ length: 10 }, (_, i) => makeRemate({ id: `l${i}`, title: `Vivo ${i}`, status: 'live' })));

    renderPage();

    expect(screen.getByText(/Mostrando 8 de 10 remates en vivo/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Remates en vivo' })).getAllByRole('article')).toHaveLength(8);
  });

  it('con el snapshot del remate en vivo, la galería muestra el lote en el martillo y su oferta', () => {
    mockRemates([makeRemate({ id: 'live-1', title: 'Hacienda en vivo', status: 'live' })]);
    useRemateLiveSnapshotMock.mockReturnValue({
      connected_users: 12,
      active_lote: { lot_number: '7', title: 'Toro Angus', base_price: '1000.00' },
      winning_offer: { amount: '1500.00' },
    } as never);

    renderPage();

    expect(screen.getByText('Lote 7: Toro Angus')).toBeInTheDocument();
    expect(screen.getByText(/1\.500/)).toBeInTheDocument();
    expect(screen.getByText('oferta actual')).toBeInTheDocument();
    useRemateLiveSnapshotMock.mockReturnValue(null);
  });

  it('sin remates en vivo, no muestra la galería y el título es "Remates disponibles"', () => {
    mockRemates([makeRemate({ id: 'a', title: 'Remate A' })]);

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Remates disponibles' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Remates en vivo' })).not.toBeInTheDocument();
  });

  it('cada fila del índice lleva al detalle del remate', () => {
    mockRemates([makeRemate({ id: 'abc', title: 'Remate A' })]);

    renderPage();

    expect(screen.getByRole('link', { name: /Remate A/ })).toHaveAttribute('href', '/remates/abc');
  });

  it('una ficha del mosaico filtra el índice por ese rubro, y "Todos los rubros" lo quita', async () => {
    mockRemates([
      makeRemate({ id: 'a', title: 'Auto A', category: 'vehiculos' }),
      makeRemate({ id: 'b', title: 'Campo B', category: 'hacienda' }),
    ]);
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    renderPage();
    expect(screen.getByText('Campo B')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver remates de Vehículos' }));
    expect(screen.getByText('Auto A')).toBeInTheDocument();
    // Las filas que salen tienen animación de salida: siguen en el DOM unos instantes.
    await waitFor(() => expect(screen.queryByText('Campo B')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Filtrar por categoría')).toHaveValue('vehiculos');

    await userEvent.click(screen.getByRole('button', { name: 'Todos los rubros' }));
    expect(screen.getByText('Campo B')).toBeInTheDocument();
  });

  it('el filtro por día deja solo los remates de ese día', async () => {
    const today = new Date();
    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    mockRemates([
      makeRemate({ id: 'hoy', title: 'Remate de hoy', starts_at: today.toISOString() }),
      makeRemate({ id: 'luego', title: 'Remate futuro', starts_at: inThreeDays.toISOString() }),
    ]);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^Hoy/ }));

    expect(screen.getByText('Remate de hoy')).toBeInTheDocument();
    // Las filas que salen tienen animación de salida: siguen en el DOM unos instantes.
    await waitFor(() => expect(screen.queryByText('Remate futuro')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^Todos\s*\d+$/ }));
    expect(screen.getByText('Remate futuro')).toBeInTheDocument();
  });

  it('el filtro por tipo de remate deja solo las Timed Auctions', async () => {
    mockRemates([
      makeRemate({ id: 'v', title: 'Remate común' }),
      makeRemate({ id: 't', title: 'Remate Timed', auction_type: 'timed' }),
    ]);

    renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por tipo de remate'), 'timed');

    expect(screen.getByText('Remate Timed')).toBeInTheDocument();
    // Las filas que salen tienen animación de salida: siguen en el DOM unos instantes.
    await waitFor(() => expect(screen.queryByText('Remate común')).not.toBeInTheDocument());
  });
});
