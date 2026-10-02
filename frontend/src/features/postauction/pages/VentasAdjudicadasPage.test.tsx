import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { VentasAdjudicadasPage } from './VentasAdjudicadasPage';
import type { PostAuctionCase, PostAuctionStatus } from '../types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: { fetchVentasAdjudicadasRequest: vi.fn(), changeVentaEstadoRequest: vi.fn() },
  toastPushMock: vi.fn(),
}));

vi.mock('../api', () => apiMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function makeCase(overrides: Partial<PostAuctionCase> = {}): PostAuctionCase {
  return {
    id: 'c1',
    lote_id: 'l1',
    lot_number: '1',
    lote_title: 'Novillos Angus',
    lote_cover_image_url: null,
    remate_id: 'r1',
    remate_title: 'Remate de hacienda',
    buyer_id: 'b1',
    buyer_name: 'Estancia La Margarita',
    rematador_id: 'e1',
    rematador_name: 'Empresa',
    base_price: '1000000.00',
    final_price: '2000000.00',
    status: 'adjudicado',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: ago(0),
    updated_at: ago(0),
    ...overrides,
  };
}

function sale(id: string, status: PostAuctionStatus, daysInState: number, overrides: Partial<PostAuctionCase> = {}) {
  return makeCase({ id, status, updated_at: ago(daysInState), created_at: ago(daysInState + 3), ...overrides });
}

function mockSales(items: PostAuctionCase[]) {
  apiMocks.fetchVentasAdjudicadasRequest.mockResolvedValue({ items, total: items.length, page: 1, page_size: 100 });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <VentasAdjudicadasPage />
    </MemoryRouter>,
  );
}

describe('VentasAdjudicadasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mientras carga muestra esqueletos', () => {
    apiMocks.fetchVentasAdjudicadasRequest.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('sin ventas muestra el estado vacío', async () => {
    mockSales([]);
    renderPage();

    expect(await screen.findByText('Sin ventas adjudicadas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Todavía no tenés ventas adjudicadas.');
  });

  it('ante un error muestra el aviso con "Reintentar"', async () => {
    apiMocks.fetchVentasAdjudicadasRequest.mockRejectedValue(new Error('network'));
    renderPage();

    expect(await screen.findByText('No se pudieron cargar las ventas adjudicadas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el titular resume lo que hay por cobrar y "Qué hacer ahora" lista lo atrasado', async () => {
    mockSales([
      sale('late', 'pago_pendiente', 8, { contacted_at: ago(8), lote_title: 'Sembradora Crucianelli', buyer_name: 'Los Nogales S.R.L.' }),
      sale('ok', 'enviado', 1, { shipped_at: ago(1), lote_title: 'Tractor Case' }),
    ]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Qué hacer ahora' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/por cobrar y 1 cosa para resolver/);
    expect(screen.getByText('Los Nogales S.R.L. todavía no pagó')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cómo van tus ventas' })).toBeInTheDocument();
  });

  it('muestra una tarjeta por venta, con las atrasadas primero y marcadas', async () => {
    mockSales([
      sale('ok', 'enviado', 1, { shipped_at: ago(1), lote_title: 'Tractor Case' }),
      sale('late', 'pago_pendiente', 8, { contacted_at: ago(8), lote_title: 'Sembradora Crucianelli' }),
    ]);
    renderPage();

    const section = (await screen.findByRole('heading', { name: 'Todas tus ventas' })).closest('section') as HTMLElement;
    const titles = within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Sembradora Crucianelli', 'Tractor Case']);
    expect(within(section).getByText('Atrasada')).toBeInTheDocument();
  });

  it('el filtro "Atrasadas" deja solo las atrasadas y la búsqueda filtra por comprador', async () => {
    mockSales([
      sale('ok', 'enviado', 1, { shipped_at: ago(1), lote_title: 'Tractor Case', buyer_name: 'Cooperativa Sur' }),
      sale('late', 'pago_pendiente', 8, { contacted_at: ago(8), lote_title: 'Sembradora', buyer_name: 'Los Nogales' }),
    ]);
    renderPage();
    await screen.findByRole('heading', { name: 'Todas tus ventas' });
    const section = screen.getByRole('heading', { name: 'Todas tus ventas' }).closest('section') as HTMLElement;

    await userEvent.click(within(within(section).getByRole('group', { name: 'Filtrar ventas' })).getByRole('button', { name: /Atrasadas/ }));
    expect(within(section).queryByRole('heading', { name: 'Tractor Case' })).not.toBeInTheDocument();
    expect(within(section).getByRole('heading', { name: 'Sembradora' })).toBeInTheDocument();

    await userEvent.click(within(within(section).getByRole('group', { name: 'Filtrar ventas' })).getByRole('button', { name: /Todas/ }));
    await userEvent.type(within(section).getByLabelText('Buscar venta'), 'cooperativa');
    expect(within(section).getByRole('heading', { name: 'Tractor Case' })).toBeInTheDocument();
    expect(within(section).queryByRole('heading', { name: 'Sembradora' })).not.toBeInTheDocument();
  });

  it('el botón del próximo paso abre la confirmación y, al confirmar, cambia el estado y recarga', async () => {
    mockSales([sale('late', 'pago_pendiente', 8, { contacted_at: ago(8), lote_title: 'Sembradora' })]);
    apiMocks.changeVentaEstadoRequest.mockResolvedValue({});
    renderPage();

    const todo = (await screen.findByRole('heading', { name: 'Qué hacer ahora' })).closest('section') as HTMLElement;
    await userEvent.click(within(todo).getByRole('button', { name: 'Registrar pago recibido' }));

    const dialog = await screen.findByRole('dialog', { name: 'Registrar pago recibido' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() => expect(apiMocks.changeVentaEstadoRequest).toHaveBeenCalledWith('late', expect.objectContaining({ new_status: 'pago_recibido' })));
    await waitFor(() => expect(apiMocks.fetchVentasAdjudicadasRequest).toHaveBeenCalledTimes(2));
  });
});
