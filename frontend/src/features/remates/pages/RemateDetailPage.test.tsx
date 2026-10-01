import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { RemateDetailPage } from './RemateDetailPage';
import type { Lote, Remate } from '../types';

const { navigateMock, useRemateDetailMock, useLotesMock, useAuthMock, fetchLeadingOfferAmountMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useRemateDetailMock: vi.fn(),
  useLotesMock: vi.fn(),
  useAuthMock: vi.fn(),
  fetchLeadingOfferAmountMock: vi.fn(),
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

vi.mock('../api', () => ({ fetchLeadingOfferAmountRequest: fetchLeadingOfferAmountMock }));

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
  afterEach(() => {
    act(() => {
      useLayoutPreferencesStore.setState({ isTopNav: false });
    });
  });

  beforeEach(() => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    fetchLeadingOfferAmountMock.mockReset();
    fetchLeadingOfferAmountMock.mockResolvedValue(null);
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

  it('muestra el tipo de remate en los Detalles (live por default)', () => {
    useRemateDetailMock.mockReturnValue({ remate: makeRemate(), isLoading: false, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Tipo de remate')).toBeInTheDocument();
    expect(screen.getByText('Remate en vivo')).toBeInTheDocument();
  });

  it('un remate timed se anuncia como "Remate timed auction" en los Detalles', () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({ auction_type: 'timed' }),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Tipo de remate')).toBeInTheDocument();
    expect(screen.getByText('Remate timed auction')).toBeInTheDocument();
  });

  it('sin garantía configurada, los Detalles dicen que no se requiere', () => {
    useRemateDetailMock.mockReturnValue({ remate: makeRemate(), isLoading: false, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Garantía para ofertar')).toBeInTheDocument();
    expect(screen.getByText('No se requiere garantía')).toBeInTheDocument();
  });

  it('con garantía exigida, los Detalles muestran el monto', () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({
        settings: {
          anti_sniping_enabled: false,
          anti_sniping_extension_seconds: 60,
          currency: 'ARS',
          lote_timer_seconds: null,
          guarantee_required: true,
          guarantee_amount: '50000',
        },
      }),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Garantía para ofertar')).toBeInTheDocument();
    expect(screen.getByText(/50\.000/)).toBeInTheDocument();
  });

  it('en un remate TIMED, pide el monto líder de cada lote abierto (best-effort, en paralelo)', async () => {
    fetchLeadingOfferAmountMock.mockImplementation((_remateId: string, loteId: string) =>
      Promise.resolve(loteId === '1' ? '1750.00' : null),
    );
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({ auction_type: 'timed' }),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({
      lotes: [
        { ...makeLote('1'), status: 'open' },
        { ...makeLote('2'), status: 'open' },
        { ...makeLote('3'), status: 'pending' }, // no abierto: no se pide
      ],
      total: 3,
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    await waitFor(() => {
      expect(fetchLeadingOfferAmountMock).toHaveBeenCalledWith('remate-1', '1');
      expect(fetchLeadingOfferAmountMock).toHaveBeenCalledWith('remate-1', '2');
    });
    expect(fetchLeadingOfferAmountMock).not.toHaveBeenCalledWith('remate-1', '3');

    // El lote con oferta líder la muestra; el que no tiene, muestra la base.
    await screen.findByText('Precio actual');
    expect(screen.getByText(/1\.750/)).toBeInTheDocument();
  });

  it('en un remate LIVE, no pide montos líderes (sin llamadas extra)', () => {
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({ auction_type: 'live' }),
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    useLotesMock.mockReturnValue({
      lotes: [{ ...makeLote('1'), status: 'open' }],
      total: 1,
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(fetchLeadingOfferAmountMock).not.toHaveBeenCalled();
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

  function mockLoaded(remate: Remate, lotes: Lote[]) {
    useRemateDetailMock.mockReturnValue({ remate, isLoading: false, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes, total: lotes.length, isLoading: false, error: null, reload: vi.fn() });
  }

  const withImages = (id: string, urls: string[], overrides: Partial<Lote> = {}): Lote => ({
    ...makeLote(id),
    images: urls.map((url, order) => ({ url, order, caption: null })),
    ...overrides,
  });

  it('le pide a AppLayout la barra superior mientras está montada y la suelta al salir', () => {
    mockLoaded(makeRemate(), []);

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(false);
  });

  it('el link para volver lleva al inicio con sesión y al listado público sin sesión', () => {
    mockLoaded(makeRemate(), []);
    const { unmount } = renderPage();
    expect(screen.getByRole('link', { name: 'Remates' })).toHaveAttribute('href', '/');
    unmount();

    useAuthMock.mockReturnValue({ isAuthenticated: false });
    renderPage();
    expect(screen.getByRole('link', { name: 'Remates' })).toHaveAttribute('href', '/remates');
  });

  it('un remate timed se anuncia también en la portada', () => {
    mockLoaded(makeRemate({ auction_type: 'timed' }), []);

    renderPage();

    expect(screen.getByText('Timed auction')).toBeInTheDocument();
  });

  it('una garantía exigida sin monto configurado dice "Requerida"', () => {
    mockLoaded(
      makeRemate({
        settings: {
          anti_sniping_enabled: false,
          anti_sniping_extension_seconds: 60,
          currency: 'ARS',
          lote_timer_seconds: null,
          guarantee_required: true,
          guarantee_amount: null,
        },
      }),
      [],
    );

    renderPage();

    expect(screen.getByText('Requerida')).toBeInTheDocument();
  });

  it('sin ubicación ni fecha de inicio, la franja de datos dice "A confirmar"', () => {
    mockLoaded(makeRemate({ location: null, starts_at: null }), []);

    renderPage();

    expect(screen.getAllByText('A confirmar')).toHaveLength(2);
  });

  it('el mosaico de la portada junta la portada del remate y las fotos de los primeros lotes', () => {
    mockLoaded(makeRemate({ cover_image_url: 'https://img.test/portada.jpg' }), [
      withImages('1', ['https://img.test/a.jpg']),
      withImages('2', ['https://img.test/b.jpg']),
    ]);

    renderPage();

    const hero = screen.getByRole('region', { name: 'Portada del remate' });
    const sources = Array.from(hero.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(sources).toEqual(['https://img.test/portada.jpg', 'https://img.test/a.jpg', 'https://img.test/b.jpg']);
  });

  it('el filtro por estado deja solo los lotes de ese estado', async () => {
    mockLoaded(makeRemate({ status: 'live' }), [
      { ...makeLote('1'), status: 'open' },
      { ...makeLote('2'), status: 'pending' },
      { ...makeLote('3'), status: 'closed_sold', final_price: '2500.00' },
    ]);

    renderPage();
    expect(screen.getByRole('button', { name: /Lote 1:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lote 2:/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Pendiente/ }));

    expect(screen.queryByRole('button', { name: /Lote 1:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lote 2:/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Todos/ }));
    expect(screen.getByRole('button', { name: /Lote 1:/ })).toBeInTheDocument();
  });

  it('un lote vendido muestra el precio en que se vendió', () => {
    mockLoaded(makeRemate({ status: 'finished' }), [{ ...makeLote('1'), status: 'closed_sold', final_price: '2500.00' }]);

    renderPage();

    expect(screen.getByText('Vendido en')).toBeInTheDocument();
    expect(screen.getByText(/2\.500/)).toBeInTheDocument();
  });

  it('tocar un lote abre el visor con sus fotos ordenadas por order y se navega con las flechas', async () => {
    mockLoaded(makeRemate(), [
      {
        ...makeLote('1'),
        description: 'Descripción del lote.',
        reserve_price: '1800.00',
        // Desordenadas a propósito: el visor tiene que mostrar primero la de `order: 0`.
        images: [
          { url: 'https://img.test/segunda.jpg', order: 1, caption: null },
          { url: 'https://img.test/primera.jpg', order: 0, caption: null },
        ],
      },
    ]);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Lote 1:/ }));

    const dialog = await screen.findByRole('dialog', { name: /Lote 1:/ });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://img.test/primera.jpg');
    expect(within(dialog).getByText('1 de 2')).toBeInTheDocument();
    expect(within(dialog).getByText('Descripción del lote.')).toBeInTheDocument();
    expect(within(dialog).getByText('Reserva')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Foto siguiente' }));
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://img.test/segunda.jpg');
    expect(within(dialog).getByText('2 de 2')).toBeInTheDocument();
  });

  it('el visor se cierra con Escape', async () => {
    mockLoaded(makeRemate(), [withImages('1', ['https://img.test/a.jpg'])]);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Lote 1:/ }));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('un lote sin fotos se puede abrir igual y muestra sus datos', async () => {
    mockLoaded(makeRemate(), [makeLote('1')]);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Lote 1:/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Precio base')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument();
  });
});
