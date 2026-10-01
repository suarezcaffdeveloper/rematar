import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lote } from '../../remates/types';
import { TimedLoteCatalog, type TimedLoteCatalogProps } from './TimedLoteCatalog';

const HOUR = 3600 * 1000;

function makeLote(id: string, overrides: Partial<Lote> = {}): Lote {
  return {
    id,
    remate_id: 'remate-1',
    lot_number: id,
    display_order: Number(id),
    title: `Lote de prueba ${id}`,
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
    timer_ends_at: new Date(Date.now() + 5 * HOUR).toISOString(),
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderCatalog(overrides: Partial<TimedLoteCatalogProps> = {}) {
  const props: TimedLoteCatalogProps = {
    lotes: [makeLote('1'), makeLote('2')],
    selectedLoteId: '1',
    onSelect: vi.fn(),
    leadingAmounts: {},
    leadingBuyerIds: {},
    currentUserId: null,
    currency: 'ARS',
    ...overrides,
  };
  return { ...render(<TimedLoteCatalog {...props} />), props };
}

/** Los títulos de los lotes, en el orden en que aparecen en el mosaico. */
function titlesInOrder(): string[] {
  return screen.getAllByRole('listitem').map((item) => within(item).getByText(/^Lote de prueba/).textContent ?? '');
}

describe('TimedLoteCatalog', () => {
  it('por defecto ordena por el que cierra antes; los cerrados y los que no abrieron van al final', () => {
    renderCatalog({
      lotes: [
        makeLote('1', { status: 'closed_sold', timer_ends_at: null, final_price: '1500.00' }),
        makeLote('2', { timer_ends_at: new Date(Date.now() + 9 * HOUR).toISOString() }),
        makeLote('3', { timer_ends_at: new Date(Date.now() + 2 * HOUR).toISOString() }),
        makeLote('4', { status: 'pending', timer_ends_at: null }),
      ],
    });

    expect(titlesInOrder()).toEqual([
      'Lote de prueba 3',
      'Lote de prueba 2',
      'Lote de prueba 4',
      'Lote de prueba 1',
    ]);
  });

  it('se puede ordenar por número de lote', async () => {
    renderCatalog({
      lotes: [
        makeLote('1', { timer_ends_at: new Date(Date.now() + 9 * HOUR).toISOString() }),
        makeLote('2', { timer_ends_at: new Date(Date.now() + 2 * HOUR).toISOString() }),
      ],
    });
    expect(titlesInOrder()).toEqual(['Lote de prueba 2', 'Lote de prueba 1']);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar' }), 'number');

    expect(titlesInOrder()).toEqual(['Lote de prueba 1', 'Lote de prueba 2']);
  });

  it('tocar un lote avisa cuál es, y el que se está viendo dice "Lo estás viendo"', async () => {
    const { props } = renderCatalog();

    expect(screen.getAllByText('Lo estás viendo')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Lote de prueba 2/ }));

    expect(props.onSelect).toHaveBeenCalledWith('2');
  });

  it('cada lote muestra su precio: la base sin ofertas, la oferta actual con ofertas, el final si se vendió', () => {
    renderCatalog({
      lotes: [
        makeLote('1'),
        makeLote('2'),
        makeLote('3', { status: 'closed_sold', timer_ends_at: null, final_price: '3200.00' }),
        makeLote('4', { status: 'closed_unsold', timer_ends_at: null }),
      ],
      leadingAmounts: { '2': '1500.00' },
    });

    expect(screen.getAllByText('Base')).toHaveLength(1);
    expect(screen.getByText('Oferta actual')).toBeInTheDocument();
    // "Vendido" aparece dos veces: en la franja de la foto y como etiqueta del precio final.
    expect(screen.getAllByText('Vendido')).toHaveLength(2);
    expect(screen.getByText('Sin ofertas')).toBeInTheDocument();
    expect(screen.getByText('Cerró sin ofertas')).toBeInTheDocument();
  });

  it('el filtro "Abiertos" saca los cerrados y "Cerrados" deja solo los cerrados', async () => {
    renderCatalog({
      lotes: [
        makeLote('1'),
        makeLote('2', { status: 'closed_sold', timer_ends_at: null, final_price: '1200.00' }),
        makeLote('3', { status: 'pending', timer_ends_at: null }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Abiertos' }));
    expect(titlesInOrder()).toEqual(['Lote de prueba 1']);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrados' }));
    expect(titlesInOrder()).toEqual(['Lote de prueba 2']);

    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('"Cierran pronto" deja los lotes que cierran dentro de la hora', async () => {
    renderCatalog({
      lotes: [
        makeLote('1', { timer_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString() }),
        makeLote('2', { timer_ends_at: new Date(Date.now() + 6 * HOUR).toISOString() }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Cierran pronto' }));

    expect(titlesInOrder()).toEqual(['Lote de prueba 1']);
  });

  it('el buscador filtra por número, título o rubro', async () => {
    renderCatalog({
      lotes: [makeLote('1', { title: 'Toro Angus' }), makeLote('2', { title: 'Vaquillona', category: 'vehiculos' })],
    });
    const search = screen.getByRole('searchbox', { name: 'Buscar lote por número, título o categoría' });

    await userEvent.type(search, 'angus');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    await userEvent.clear(search);
    await userEvent.type(search, 'vehículos');
    expect(screen.getByRole('button', { name: /Vaquillona/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Toro Angus/ })).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.getByText('Ningún lote coincide con lo que buscás.')).toBeInTheDocument();
  });

  it('"Voy liderando" solo aparece si lideras algún lote, y marca ese lote', async () => {
    const { rerender, props } = renderCatalog({ currentUserId: 'yo' });
    expect(screen.queryByRole('button', { name: 'Voy liderando' })).not.toBeInTheDocument();

    rerender(<TimedLoteCatalog {...props} currentUserId="yo" leadingBuyerIds={{ '2': 'yo', '1': 'otro' }} />);

    expect(screen.getByText('Vas liderando')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voy liderando' }));
    expect(titlesInOrder()).toEqual(['Lote de prueba 2']);
  });

  it('si el filtro "Voy liderando" estaba activo y dejás de liderar, vuelve a mostrar todos', async () => {
    const { rerender, props } = renderCatalog({ currentUserId: 'yo', leadingBuyerIds: { '2': 'yo' } });
    await userEvent.click(screen.getByRole('button', { name: 'Voy liderando' }));

    rerender(<TimedLoteCatalog {...props} currentUserId="yo" leadingBuyerIds={{ '2': 'otro' }} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('un lote con el timer pausado dice "Pausado"', () => {
    renderCatalog({
      lotes: [makeLote('1', { timer_ends_at: null, timer_paused_remaining_seconds: 600 })],
    });

    expect(screen.getByText('Pausado')).toBeInTheDocument();
  });
});
