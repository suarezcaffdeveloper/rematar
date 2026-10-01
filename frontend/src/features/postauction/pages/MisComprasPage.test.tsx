import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import type { PostAuctionCase } from '../types';
import { MisComprasPage } from './MisComprasPage';

const { useAllMisComprasMock } = vi.hoisted(() => ({ useAllMisComprasMock: vi.fn() }));
vi.mock('../hooks', () => ({ useAllMisCompras: useAllMisComprasMock }));

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isTopNav: false });
  });
});

function makeCompra(overrides: Partial<PostAuctionCase> & { id: string }): PostAuctionCase {
  return {
    lote_id: 'lote',
    lot_number: '1',
    lote_title: 'Lote genérico',
    lote_cover_image_url: null,
    remate_id: 'remate',
    remate_title: 'Remate genérico',
    buyer_id: 'buyer',
    buyer_name: null,
    rematador_id: 'empresa',
    rematador_name: 'Casa Belgrano',
    base_price: '1000',
    final_price: '1500',
    status: 'adjudicado',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function mockCompras(compras: PostAuctionCase[]) {
  useAllMisComprasMock.mockReturnValue({ data: compras, isLoading: false, error: null, reload: vi.fn() });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MisComprasPage />
    </MemoryRouter>,
  );
}

describe('MisComprasPage', () => {
  it('mientras carga, muestra esqueletos y no el resumen ni un error', () => {
    useAllMisComprasMock.mockReturnValue({ data: [], isLoading: true, error: null, reload: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Tu próximo paso' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ante un error, lo muestra junto con un botón para reintentar', async () => {
    const reload = vi.fn();
    useAllMisComprasMock.mockReturnValue({ data: [], isLoading: false, error: { message: 'boom' }, reload });

    renderPage();
    expect(screen.getByText('No se pudieron cargar tus compras.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sin compras, muestra el estado vacío', () => {
    mockCompras([]);

    renderPage();

    expect(screen.getByText('Todavía no ganaste ningún lote')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filtrar por etapa' })).not.toBeInTheDocument();
  });

  it('le pide a AppLayout la barra superior mientras está montada y la suelta al salir', () => {
    mockCompras([]);

    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(false);
  });

  it('pone al frente la compra que espera el pago, con su link al detalle', () => {
    mockCompras([
      makeCompra({ id: 'envio', lote_title: 'Lote enviado', status: 'enviado' }),
      makeCompra({ id: 'pago', lote_title: 'Lote a pagar', status: 'pago_pendiente' }),
    ]);

    renderPage();

    const hero = screen.getByRole('region', { name: 'Tu próximo paso' });
    expect(within(hero).getByRole('heading', { name: 'Lote a pagar' })).toBeInTheDocument();
    expect(within(hero).getByText('Esperando tu pago')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: /Ver compra/ })).toHaveAttribute('href', '/mis-compras/pago');
  });

  it('muestra las últimas novedades al costado, cada una con link a su compra', () => {
    mockCompras([
      makeCompra({ id: 'a', lote_title: 'Lote A', status: 'enviado', shipped_at: '2026-09-20T10:00:00Z' }),
      makeCompra({ id: 'b', lote_title: 'Lote B', status: 'pago_pendiente' }),
    ]);

    renderPage();

    const novedades = screen.getByRole('complementary', { name: 'Últimas novedades' });
    expect(within(novedades).getByText(/Fue enviada/)).toBeInTheDocument();
    expect(within(novedades).getByRole('link', { name: /Lote A/ })).toHaveAttribute('href', '/mis-compras/a');
  });

  it('separa "En proceso" de "Recibidas"', () => {
    mockCompras([
      makeCompra({ id: 'a', lote_title: 'Lote en camino', status: 'enviado' }),
      makeCompra({ id: 'b', lote_title: 'Lote recibido', status: 'entregado' }),
    ]);

    renderPage();

    const proceso = screen.getByRole('region', { name: 'En proceso' });
    const recibidas = screen.getByRole('region', { name: 'Recibidas' });
    expect(within(proceso).getByText('Lote en camino')).toBeInTheDocument();
    expect(within(proceso).queryByText('Lote recibido')).not.toBeInTheDocument();
    expect(within(recibidas).getByText('Lote recibido')).toBeInTheDocument();
  });

  it('si no hay nada esperando (todo en camino o recibido), no hay compra destacada pero sí novedades', () => {
    mockCompras([makeCompra({ id: 'a', lote_title: 'Lote en camino', status: 'enviado' })]);

    renderPage();

    expect(screen.queryByRole('region', { name: 'Tu próximo paso' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Últimas novedades' })).toBeInTheDocument();
  });

  it('el filtro por etapa deja solo las compras de esa etapa', async () => {
    mockCompras([
      makeCompra({ id: 'a', lote_title: 'Lote por pagar', status: 'pago_pendiente' }),
      makeCompra({ id: 'b', lote_title: 'Lote en camino', status: 'enviado' }),
      makeCompra({ id: 'c', lote_title: 'Lote recibido', status: 'entregado' }),
    ]);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^En camino/ }));

    const proceso = screen.getByRole('region', { name: 'En proceso' });
    expect(within(proceso).getByText('Lote en camino')).toBeInTheDocument();
    expect(within(proceso).queryByText('Lote por pagar')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recibidas' })).not.toBeInTheDocument();
  });

  it('si la búsqueda no matchea nada, muestra el estado vacío con opción de limpiar', async () => {
    mockCompras([makeCompra({ id: 'a', lote_title: 'Lote A', status: 'enviado' })]);

    renderPage();
    await userEvent.type(screen.getByLabelText('Buscar en mis compras'), 'no existe');

    expect(screen.getByText('Ninguna compra coincide con tu búsqueda')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(within(screen.getByRole('region', { name: 'En proceso' })).getByText('Lote A')).toBeInTheDocument();
  });
});
