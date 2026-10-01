import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TimedSalaPage } from './TimedSalaPage';
import type { Lote, Remate } from '../../remates/types';
import type { UseLoteRecentOffersResult, UseTimedSalaStateResult } from '../hooks';

const { navigateMock, useTimedSalaStateMock, useLoteRecentOffersMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useTimedSalaStateMock: vi.fn(),
  useLoteRecentOffersMock: vi.fn(),
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
  useTimedSalaState: useTimedSalaStateMock,
  useLoteRecentOffers: useLoteRecentOffersMock,
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate Timed de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: null,
    status: 'live',
    auction_type: 'timed',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
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
    status: 'open',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function mockTimedState(overrides: Partial<UseTimedSalaStateResult> = {}) {
  useTimedSalaStateMock.mockReturnValue({ ...defaultTimedState(), ...overrides });
}

function defaultTimedState(): UseTimedSalaStateResult {
  return {
    remate: makeRemate(),
    lotes: [makeLote()],
    leadingAmounts: {},
    leadingBuyerIds: {},
    offerActivityVersion: {},
    isLoading: false,
    error: null,
    reload: vi.fn(),
    connectionStatus: 'open',
    subscribeToRealtime: () => () => {},
  };
}

function mockRecentOffers(overrides: Partial<UseLoteRecentOffersResult> = {}) {
  useLoteRecentOffersMock.mockReturnValue({ offers: [], isLoading: false, ...overrides });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TimedSalaPage />
    </MemoryRouter>,
  );
}

describe('TimedSalaPage', () => {
  it('mientras carga, muestra esqueletos', () => {
    mockTimedState({ remate: null, lotes: [], isLoading: true, connectionStatus: 'connecting' });
    mockRecentOffers();

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('si falla la carga, muestra el error con reintentar y volver al dashboard', async () => {
    const reload = vi.fn();
    mockTimedState({
      remate: null,
      lotes: [],
      error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' },
      reload,
    });
    mockRecentOffers();

    renderPage();

    expect(screen.getByText('Remate no encontrado.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('sin lotes, muestra el estado vacío', () => {
    mockTimedState({ lotes: [] });
    mockRecentOffers();

    renderPage();

    expect(screen.getByText('Todavía no hay lotes cargados')).toBeInTheDocument();
  });

  it('con varios lotes, arranca mostrando el primer lote abierto y permite cambiar de lote desde el catálogo', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mockTimedState({
      lotes: [
        makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus', status: 'open' }),
        makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona', status: 'open' }),
      ],
    });
    mockRecentOffers();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
    expect(screen.getByText('2 lotes en este remate', { exact: false })).toBeInTheDocument();

    // El lote del catálogo es un botón: su nombre accesible incluye el número y el título.
    await userEvent.click(screen.getByRole('button', { name: /Vaquillona/ }));

    expect(screen.getByRole('heading', { name: 'Vaquillona' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Toro Angus' })).not.toBeInTheDocument();
    // La vitrina queda arriba del catálogo: al elegir un lote se sube hasta ella.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    scrollTo.mockRestore();
  });

  it('ignora los lotes cancelados al elegir el lote inicial y al armar el carrusel', () => {
    mockTimedState({
      lotes: [
        makeLote({ id: 'lote-1', lot_number: '1', title: 'Lote cancelado', status: 'cancelled' }),
        makeLote({ id: 'lote-2', lot_number: '2', title: 'Toro Angus', status: 'open' }),
      ],
    });
    mockRecentOffers();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
    expect(screen.queryByText('Lote cancelado')).not.toBeInTheDocument();
  });

  it('con el remate en vivo y un visitante anónimo, muestra el llamado a iniciar sesión para ofertar', () => {
    mockTimedState({ lotes: [makeLote()] });
    mockRecentOffers();

    renderPage();

    expect(screen.getByRole('button', { name: 'Iniciá sesión para ofertar' })).toBeInTheDocument();
  });

  it('el buscador filtra el catálogo pero no cambia el lote que se está viendo', async () => {
    mockTimedState({
      lotes: [
        makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus', status: 'open' }),
        makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona Holando', status: 'open' }),
      ],
    });
    mockRecentOffers();

    renderPage();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lote por número, título o categoría' }), 'holando');

    expect(screen.getByRole('button', { name: /Vaquillona Holando/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Toro Angus/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
  });

  it('el buscador sin coincidencias muestra un aviso y deja la vitrina como estaba', async () => {
    mockTimedState({
      lotes: [
        makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus', status: 'open' }),
        makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona', status: 'open' }),
      ],
    });
    mockRecentOffers();

    renderPage();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lote por número, título o categoría' }), 'ovejas');

    expect(screen.getByText('Ningún lote coincide con lo que buscás.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
  });

  it('la cabecera dice cuántos lotes siguen abiertos y vuelve a la ficha del remate', () => {
    mockTimedState({
      lotes: [
        makeLote({ id: 'lote-1', lot_number: '1', status: 'open' }),
        makeLote({ id: 'lote-2', lot_number: '2', title: 'Vendido', status: 'closed_sold', final_price: '1200.00' }),
      ],
    });
    mockRecentOffers();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Remate Timed de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('1 lote abierto de 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al remate' })).toHaveAttribute('href', '/remates/remate-1');
  });

  it('si el lote elegido ya cerró, la mesa de ofertas muestra el precio final y no el formulario', async () => {
    mockTimedState({
      lotes: [
        makeLote({ id: 'lote-1', lot_number: '1', title: 'Toro Angus', status: 'open' }),
        makeLote({ id: 'lote-2', lot_number: '2', title: 'Vaquillona', status: 'closed_sold', final_price: '1200.00' }),
      ],
    });
    mockRecentOffers();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Vaquillona/ }));

    expect(screen.getByText('Este lote ya se vendió. No se aceptan más ofertas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciá sesión para ofertar' })).not.toBeInTheDocument();
  });
});
