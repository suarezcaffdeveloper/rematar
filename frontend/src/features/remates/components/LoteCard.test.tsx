import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteCard } from './LoteCard';
import type { Lote } from '../types';

function makeLote(overrides: Partial<Lote>): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '12',
    display_order: 0,
    title: 'Tractor John Deere',
    description: 'Tractor en excelente estado, motor revisado.',
    category: 'maquinaria_pesada_y_agricola',
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
    ...overrides,
  };
}

describe('LoteCard', () => {
  it('muestra número de lote, título, descripción y estado', () => {
    render(<LoteCard lote={makeLote({ status: 'open' })} currency="ARS" />);

    expect(screen.getByText('Lote 12')).toBeInTheDocument();
    expect(screen.getByText('Tractor John Deere')).toBeInTheDocument();
    expect(screen.getByText('Tractor en excelente estado, motor revisado.')).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
  });

  it('muestra precio inicial e incremento mínimo', () => {
    render(<LoteCard lote={makeLote({ base_price: '1000.00', min_increment: '50.00' })} currency="ARS" />);

    expect(screen.getByText(/1\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Incremento/)).toBeInTheDocument();
  });

  it('con reserva cargada, la muestra', () => {
    render(<LoteCard lote={makeLote({ reserve_price: '1500.00' })} currency="ARS" />);
    expect(screen.getByText(/Reserva/)).toBeInTheDocument();
  });

  it('sin reserva (enmascarada por el backend para compradores), no muestra la fila', () => {
    render(<LoteCard lote={makeLote({ reserve_price: null })} currency="ARS" />);
    expect(screen.queryByText(/Reserva/)).not.toBeInTheDocument();
  });

  it('sin imágenes, no intenta renderizar un <img> roto ni la hace expandible', () => {
    render(<LoteCard lote={makeLote({ images: [] })} currency="ARS" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con varias imágenes, usa la de menor "order" como principal', () => {
    render(
      <LoteCard
        lote={makeLote({
          images: [
            { url: 'https://example.com/second.jpg', order: 2, caption: 'Segunda' },
            { url: 'https://example.com/first.jpg', order: 1, caption: 'Principal' },
          ],
        })}
        currency="ARS"
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/first.jpg');
  });

  it('sin descripción, no deja un párrafo vacío', () => {
    render(<LoteCard lote={makeLote({ description: null })} currency="ARS" />);

    expect(screen.getByText('Tractor John Deere')).toBeInTheDocument();
  });

  it('con varias imágenes, al hacer click abre un modal con el carrusel, nombre y descripción completa', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    render(<LoteCard lote={lote} currency="ARS" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));

    const dialog = screen.getByRole('dialog', { name: 'Tractor John Deere' });
    expect(within(dialog).getByRole('group', { name: /Galería de imágenes/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Imagen siguiente' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Tractor John Deere' })).toBeInTheDocument();
    expect(within(dialog).getByText('Tractor en excelente estado, motor revisado.')).toBeInTheDocument();
  });

  it('navegar el carrusel dentro del modal no lo cierra', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    render(<LoteCard lote={lote} currency="ARS" />);

    await userEvent.click(screen.getByRole('button'));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Imagen siguiente' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://example.com/b.jpg');
  });

  it('cierra el modal con el botón "Cerrar"', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    render(<LoteCard lote={lote} currency="ARS" />);

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('modo timed + lote open: muestra precio líder y cuenta regresiva abajo a la derecha', () => {
    render(
      <LoteCard
        lote={makeLote({
          status: 'open',
          timer_ends_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        })}
        currency="ARS"
        auctionType="timed"
        leadingAmount="1750.00"
      />,
    );

    expect(screen.getByText('Precio actual')).toBeInTheDocument();
    expect(screen.getByText(/1\.750/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('modo timed + lote open sin ofertas todavía: muestra la base, no inventa una puja líder', () => {
    render(
      <LoteCard
        lote={makeLote({ status: 'open', base_price: '1000.00' })}
        currency="ARS"
        auctionType="timed"
        leadingAmount={null}
      />,
    );

    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.queryByText('Precio actual')).not.toBeInTheDocument();
  });

  it('modo live (default) no muestra el bloque timed aunque el lote esté open', () => {
    render(<LoteCard lote={makeLote({ status: 'open' })} currency="ARS" leadingAmount="1750.00" />);

    expect(screen.queryByText('Precio actual')).not.toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('modo timed pero lote no abierto (pending/closed): sin bloque timed', () => {
    render(
      <LoteCard
        lote={makeLote({ status: 'closed_sold', final_price: '2000.00' })}
        currency="ARS"
        auctionType="timed"
        leadingAmount="2000.00"
      />,
    );

    expect(screen.queryByText('Precio actual')).not.toBeInTheDocument();
  });
});
