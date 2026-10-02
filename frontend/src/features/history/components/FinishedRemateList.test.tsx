import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FinishedRemateList } from './FinishedRemateList';
import type { FinishedRemateSummary } from '../types';

const { historyApi, ventasApi, rematesApi } = vi.hoisted(() => ({
  historyApi: { fetchFinishedRemateHistoryRequest: vi.fn(), fetchRemateHistoryDetailRequest: vi.fn(), fetchLoteHistoryDetailRequest: vi.fn() },
  ventasApi: { fetchVentasAdjudicadasRequest: vi.fn() },
  rematesApi: { fetchRematesRequest: vi.fn() },
}));

vi.mock('../api', () => historyApi);
vi.mock('../../postauction/api', () => ({ ...ventasApi, fetchVentaDetailRequest: vi.fn(), fetchMisComprasRequest: vi.fn(), fetchMiCompraDetailRequest: vi.fn() }));
vi.mock('../../remates/api', () => rematesApi);
vi.mock('../../auth/hooks', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'empresa' } }) }));

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function makeItem(overrides: Partial<FinishedRemateSummary> = {}): FinishedRemateSummary {
  return {
    id: 'r1',
    title: 'Hacienda de invernada',
    category: 'hacienda',
    status: 'finished',
    starts_at: ago(10),
    resolved_at: ago(10),
    lote_count: 10,
    lotes_sold_count: 8,
    total_awarded_value: '2000000.00',
    buyer_count: 5,
    duration_seconds: 3600,
    owner_id: 'user-1',
    owner_name: 'Empresa',
    ...overrides,
  };
}

function mockHistory(items: FinishedRemateSummary[]) {
  historyApi.fetchFinishedRemateHistoryRequest.mockResolvedValue({ items, total: items.length, page: 1, page_size: 100 });
}

function renderList(props: Parameters<typeof FinishedRemateList>[0] = {}) {
  return render(
    <MemoryRouter>
      <FinishedRemateList {...props} />
    </MemoryRouter>,
  );
}

describe('FinishedRemateList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ventasApi.fetchVentasAdjudicadasRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    rematesApi.fetchRematesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
  });

  it('mientras carga muestra esqueletos', () => {
    historyApi.fetchFinishedRemateHistoryRequest.mockReturnValue(new Promise(() => {}));
    const { container } = renderList();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('sin remates terminados invita a esperar el primero', async () => {
    mockHistory([]);
    renderList();

    expect(await screen.findByText('Sin remates en el historial')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Todavía no tenés remates terminados.');
  });

  it('ante un error muestra el aviso con "Reintentar"', async () => {
    historyApi.fetchFinishedRemateHistoryRequest.mockRejectedValue(new Error('network'));
    renderList();

    expect(await screen.findByText('No se pudo cargar el historial de remates.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el titular resume lo vendido y las cifras separan finalizados de cancelados', async () => {
    mockHistory([makeItem({ id: 'a' }), makeItem({ id: 'b', title: 'Riego', status: 'cancelled', lotes_sold_count: 0, total_awarded_value: '0.00' })]);
    renderList();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/En todo tu historial cerraste 1 remate y vendiste/);
    const numbers = screen.getByLabelText('Resumen del período');
    expect(within(numbers).getByText('y 1 cancelado')).toBeInTheDocument();
    expect(within(numbers).getByText('8 de 10 lotes')).toBeInTheDocument();
  });

  it('el período cambia el titular y deja afuera los remates más viejos', async () => {
    mockHistory([makeItem({ id: 'a', title: 'Reciente', resolved_at: ago(5) }), makeItem({ id: 'b', title: 'Viejo', resolved_at: ago(100) })]);
    renderList();
    await screen.findByRole('heading', { level: 1 });

    await userEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: 'Últimos 30 días' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('En los últimos 30 días cerraste 1 remate');
    expect(screen.getByRole('heading', { name: 'Reciente' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Viejo' })).not.toBeInTheDocument();
  });

  it('el filtro de estado y la búsqueda filtran las tarjetas', async () => {
    mockHistory([makeItem({ id: 'a', title: 'Hacienda Tandil' }), makeItem({ id: 'b', title: 'Riego Mendoza', status: 'cancelled' })]);
    renderList();
    await screen.findByRole('heading', { level: 1 });

    await userEvent.click(within(screen.getByRole('group', { name: 'Estado' })).getByRole('button', { name: /Cancelados/ }));
    expect(screen.queryByRole('heading', { name: 'Hacienda Tandil' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Riego Mendoza' })).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('group', { name: 'Estado' })).getByRole('button', { name: /Todos/ }));
    await userEvent.type(screen.getByLabelText('Buscar remate'), 'tandil');
    expect(screen.getByRole('heading', { name: 'Hacienda Tandil' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Riego Mendoza' })).not.toBeInTheDocument();
  });

  it('cruza con las ventas: avisa cuántas quedaron sin cobrar en cada remate', async () => {
    mockHistory([makeItem({ id: 'a' })]);
    ventasApi.fetchVentasAdjudicadasRequest.mockResolvedValue({
      items: [
        { id: 'v1', remate_id: 'a', status: 'pago_pendiente' },
        { id: 'v2', remate_id: 'a', status: 'pago_recibido' },
        { id: 'v3', remate_id: 'otro', status: 'adjudicado' },
      ],
      total: 3,
      page: 1,
      page_size: 100,
    });
    renderList();

    expect(await screen.findByText('1 venta sin cobrar')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Resumen del período')).getByText('Ventas sin cobrar')).toBeInTheDocument();
  });

  it('en el panel del admin (showOwner) no pide las ventas ni muestra "sin cobrar"', async () => {
    mockHistory([makeItem({ id: 'a' })]);
    renderList({ showOwner: true });

    expect(await screen.findByRole('heading', { level: 2, name: /En todo tu historial/ })).toBeInTheDocument();
    expect(ventasApi.fetchVentasAdjudicadasRequest).not.toHaveBeenCalled();
    expect(screen.queryByText('Ventas sin cobrar')).not.toBeInTheDocument();
    expect(screen.getByText(/Empresa/)).toBeInTheDocument();
  });
});
