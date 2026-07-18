import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LotesManagementPage } from './LotesManagementPage';
import type { Lote, Remate } from '../../remates/types';

const { navigateMock, useRemateDetailMock, useLotesMock, apiMocks, duplicationMocks, toastPushMock } = vi.hoisted(
  () => ({
    navigateMock: vi.fn(),
    useRemateDetailMock: vi.fn(),
    useLotesMock: vi.fn(),
    apiMocks: {
      createRemateRequest: vi.fn(),
      updateRemateRequest: vi.fn(),
      cancelRemateRequest: vi.fn(),
      deleteRemateRequest: vi.fn(),
      scheduleRemateRequest: vi.fn(),
      createLoteRequest: vi.fn(),
      updateLoteRequest: vi.fn(),
      deleteLoteRequest: vi.fn(),
      reorderLotesRequest: vi.fn(),
    },
    duplicationMocks: {
      duplicateRemate: vi.fn(),
      duplicateLote: vi.fn(),
    },
    toastPushMock: vi.fn(),
  }),
);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ remateId: 'remate-1' }),
  };
});

vi.mock('../../remates/hooks', () => ({ useRemateDetail: useRemateDetailMock, useLotes: useLotesMock }));
vi.mock('../../remates/api', () => apiMocks);
vi.mock('../duplication', () => duplicationMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: 'Pergamino',
    starts_at: null,
    ends_at: null,
    status: 'draft',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
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
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function mockDefaults(remateOverrides: Partial<Remate> = {}, lotes: Lote[] = []) {
  useRemateDetailMock.mockReturnValue({
    remate: makeRemate(remateOverrides),
    isLoading: false,
    error: null,
    reload: vi.fn(),
  });
  useLotesMock.mockReturnValue({ lotes, total: lotes.length, isLoading: false, error: null, reload: vi.fn() });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LotesManagementPage />
    </MemoryRouter>,
  );
}

describe('LotesManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mientras carga, muestra esqueletos', () => {
    useRemateDetailMock.mockReturnValue({ remate: null, isLoading: true, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('si el remate falla, muestra el error con reintentar y volver al dashboard', async () => {
    const reload = vi.fn();
    useRemateDetailMock.mockReturnValue({
      remate: null,
      isLoading: false,
      error: { status: 404, code: 'not_found', message: 'Remate no encontrado.' },
      reload,
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });

    renderPage();
    expect(screen.getByText('Remate no encontrado.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('sin lotes, muestra el estado vacío con acción de agregar', () => {
    mockDefaults();
    renderPage();
    expect(screen.getByText('Todavía no cargaste lotes')).toBeInTheDocument();
  });

  it('con lotes, muestra una tarjeta por cada uno', () => {
    mockDefaults({}, [makeLote({ id: 'l1', title: 'Toro Angus' }), makeLote({ id: 'l2', title: 'Vaquillona', lot_number: '2' })]);
    renderPage();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Vaquillona')).toBeInTheDocument();
  });

  it('remate "live": muestra el aviso de estructura congelada y oculta "Agregar lote"', () => {
    mockDefaults({ status: 'live' }, [makeLote()]);
    renderPage();
    expect(screen.getByText(/estructura de lotes está congelada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar lote' })).not.toBeInTheDocument();
  });

  it('"Agregar lote" abre el modal de creación', async () => {
    mockDefaults();
    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar lote' })[0]);
    expect(screen.getByRole('heading', { name: 'Crear lote' })).toBeInTheDocument();
  });

  it('crear un lote llama a reloadLotes al guardar', async () => {
    const reloadLotes = vi.fn();
    useRemateDetailMock.mockReturnValue({ remate: makeRemate(), isLoading: false, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: reloadLotes });
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());

    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar lote' })[0]);
    await userEvent.type(screen.getByLabelText('Número de lote'), '1');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Toro Hereford');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.type(screen.getByLabelText('Precio inicial'), '1000');
    await userEvent.type(screen.getByLabelText('Incremento mínimo'), '50');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear lote' }));

    await waitFor(() => expect(reloadLotes).toHaveBeenCalled());
  });

  it('editar un lote abre el modal con sus valores', async () => {
    mockDefaults({}, [makeLote({ title: 'Toro Angus' })]);
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para el lote 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(screen.getByRole('heading', { name: 'Editar lote' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Toro Angus');
  });

  it('eliminar un lote pide confirmación y llama a deleteLoteRequest', async () => {
    const reloadLotes = vi.fn();
    useRemateDetailMock.mockReturnValue({ remate: makeRemate(), isLoading: false, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({
      lotes: [makeLote({ title: 'Toro Angus' })],
      total: 1,
      isLoading: false,
      error: null,
      reload: reloadLotes,
    });
    apiMocks.deleteLoteRequest.mockResolvedValue(undefined);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para el lote 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(apiMocks.deleteLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1'));
    expect(reloadLotes).toHaveBeenCalled();
  });

  it('duplicar un lote llama a duplicateLote con los lot_number existentes', async () => {
    const reloadLotes = vi.fn();
    const lote = makeLote({ title: 'Toro Angus' });
    useRemateDetailMock.mockReturnValue({ remate: makeRemate(), isLoading: false, error: null, reload: vi.fn() });
    useLotesMock.mockReturnValue({ lotes: [lote], total: 1, isLoading: false, error: null, reload: reloadLotes });
    duplicationMocks.duplicateLote.mockResolvedValue(makeLote({ id: 'lote-2' }));

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para el lote 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));

    await waitFor(() => expect(duplicationMocks.duplicateLote).toHaveBeenCalledWith('remate-1', lote, ['1']));
    expect(reloadLotes).toHaveBeenCalled();
  });

  it('mover un lote hacia abajo persiste el nuevo orden', async () => {
    mockDefaults({}, [
      makeLote({ id: 'l1', lot_number: '1', title: 'Primero' }),
      makeLote({ id: 'l2', lot_number: '2', title: 'Segundo' }),
    ]);
    apiMocks.reorderLotesRequest.mockResolvedValue([]);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Mover lote 1 hacia abajo' }));

    await waitFor(() => expect(apiMocks.reorderLotesRequest).toHaveBeenCalledWith('remate-1', ['l2', 'l1']));
  });

  it('si el reorder falla, revierte el orden local y muestra un toast de error', async () => {
    mockDefaults({}, [
      makeLote({ id: 'l1', lot_number: '1', title: 'Primero' }),
      makeLote({ id: 'l2', lot_number: '2', title: 'Segundo' }),
    ]);
    apiMocks.reorderLotesRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo reordenar.' } } },
    });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Mover lote 1 hacia abajo' }));

    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se pudo reordenar.'));
  });

  it('"Editar remate" desde la sidebar abre el modal con los datos del remate', async () => {
    mockDefaults({ title: 'Mi remate' });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Editar remate/ }));
    expect(screen.getByRole('heading', { name: 'Editar remate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Mi remate');
  });

  it('"Publicar remate" llama a scheduleRemateRequest', async () => {
    const reloadRemate = vi.fn();
    useRemateDetailMock.mockReturnValue({
      remate: makeRemate({ starts_at: '2026-09-01T10:00:00Z' }),
      isLoading: false,
      error: null,
      reload: reloadRemate,
    });
    useLotesMock.mockReturnValue({ lotes: [], total: 0, isLoading: false, error: null, reload: vi.fn() });
    apiMocks.scheduleRemateRequest.mockResolvedValue(makeRemate({ status: 'scheduled' }));

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Publicar remate/ }));

    await waitFor(() => expect(apiMocks.scheduleRemateRequest).toHaveBeenCalledWith('remate-1'));
    expect(reloadRemate).toHaveBeenCalled();
  });

  it('"Eliminar remate" pide confirmación y navega al dashboard', async () => {
    apiMocks.deleteRemateRequest.mockResolvedValue(undefined);
    mockDefaults();

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Eliminar remate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(apiMocks.deleteRemateRequest).toHaveBeenCalledWith('remate-1'));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('"Duplicar remate" navega a la página de lotes del nuevo remate', async () => {
    mockDefaults();
    duplicationMocks.duplicateRemate.mockResolvedValue(makeRemate({ id: 'remate-copia' }));

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Duplicar remate/ }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/remates/remate-copia/lotes'));
  });
});
