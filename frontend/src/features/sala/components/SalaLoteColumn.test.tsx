import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lote, Remate } from '../../remates/types';
import { SalaLoteColumn } from './SalaLoteColumn';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'live',
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
    lot_number: '7',
    display_order: 0,
    title: 'Toro Angus',
    description: 'Un toro.',
    category: 'hacienda',
    attributes: {},
    images: [
      { url: 'https://img.test/b.jpg', order: 1, caption: null },
      { url: 'https://img.test/a.jpg', order: 0, caption: null },
      { url: 'https://img.test/c.jpg', order: 2, caption: null },
    ],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'open',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: false,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

const STREAM = { stream_provider: 'youtube', stream_video_id: 'dQw4w9WgXcQ' } as const;

function mainImage() {
  return screen.getByRole('img', { name: /foto \d de \d/ });
}

describe('SalaLoteColumn (sin transmisión)', () => {
  it('muestra la foto de menor orden, el contador y los datos del lote', () => {
    render(<SalaLoteColumn remate={makeRemate()} lote={makeLote()} onReload={vi.fn()} />);

    expect(mainImage()).toHaveAttribute('src', 'https://img.test/a.jpg');
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
  });

  it('las flechas y las miniaturas cambian de foto, y las flechas dan la vuelta', async () => {
    render(<SalaLoteColumn remate={makeRemate()} lote={makeLote()} onReload={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }));
    expect(mainImage()).toHaveAttribute('src', 'https://img.test/b.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'Ver foto 3' }));
    expect(mainImage()).toHaveAttribute('src', 'https://img.test/c.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }));
    expect(mainImage()).toHaveAttribute('src', 'https://img.test/a.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'Foto anterior' }));
    expect(mainImage()).toHaveAttribute('src', 'https://img.test/c.jpg');
  });

  it('con una sola foto no hay flechas ni miniaturas', () => {
    render(
      <SalaLoteColumn
        remate={makeRemate()}
        lote={makeLote({ images: [{ url: 'https://img.test/a.jpg', order: 0, caption: null }] })}
        onReload={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Fotos del lote' })).not.toBeInTheDocument();
  });

  it('sin fotos, muestra el respaldo de marca y no rompe', () => {
    render(<SalaLoteColumn remate={makeRemate()} lote={makeLote({ images: [] })} onReload={vi.fn()} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
  });

  it('sin lote abierto, muestra el estado vacío con "Actualizar"', async () => {
    const onReload = vi.fn();
    render(<SalaLoteColumn remate={makeRemate()} lote={null} onReload={onReload} />);

    expect(screen.getByText('No hay ningún lote abierto en este momento')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

describe('SalaLoteColumn (con transmisión)', () => {
  it('pone el video arriba y el lote debajo, con una sola foto chica', () => {
    const { container } = render(<SalaLoteColumn remate={makeRemate(STREAM)} lote={makeLote()} onReload={vi.fn()} />);

    const iframe = screen.getByTitle('Transmisión en vivo: Remate de hacienda');
    const heading = screen.getByRole('heading', { name: 'Toro Angus' });
    expect(iframe.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // El video no se puede ocultar ni se arma galería: no hay flechas de fotos.
    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('con un ID de video inválido, no hay video y la columna queda como sin transmisión', () => {
    render(
      <SalaLoteColumn
        remate={makeRemate({ stream_provider: 'youtube', stream_video_id: 'mal' })}
        lote={makeLote()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.queryByTitle(/Transmisión en vivo/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeInTheDocument();
  });

  it('con transmisión y sin lote, deja el video y muestra el estado vacío debajo', () => {
    render(<SalaLoteColumn remate={makeRemate(STREAM)} lote={null} onReload={vi.fn()} />);

    const column = screen.getByRole('region', { name: 'Lote en remate' });
    expect(within(column).getByTitle('Transmisión en vivo: Remate de hacienda')).toBeInTheDocument();
    expect(within(column).getByText('No hay ningún lote abierto en este momento')).toBeInTheDocument();
  });
});
