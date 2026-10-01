import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lote } from '../../remates/types';
import { LoteIdentity } from './LoteIdentity';

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '7',
    display_order: 0,
    title: 'Toro Angus',
    description: 'Un toro muy bueno.',
    category: 'hacienda',
    attributes: { peso: 600 },
    images: [],
    quantity: 3,
    unit_label: 'cabezas',
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

/** jsdom no hace layout: `scrollHeight`/`clientHeight` valen 0. Se simula que el texto
 * recortado necesita más alto del que tiene. */
function simulateOverflow(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

describe('LoteIdentity', () => {
  it('muestra número, rubro, título y descripción del lote', () => {
    render(<LoteIdentity lote={makeLote()} />);

    expect(screen.getByText('En remate ahora')).toBeInTheDocument();
    expect(screen.getByText(/Lote 7/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toro Angus' })).toBeInTheDocument();
    expect(screen.getByText('Un toro muy bueno.')).toBeInTheDocument();
  });

  it('nunca muestra la ficha técnica (atributos, cantidad, unidad): decisión de contenido de la Sala', () => {
    render(<LoteIdentity lote={makeLote()} />);

    expect(screen.queryByText(/peso/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cabezas/i)).not.toBeInTheDocument();
  });

  it('sin descripción, lo dice', () => {
    render(<LoteIdentity lote={makeLote({ description: null })} />);

    expect(screen.getByText('Este lote todavía no tiene una descripción cargada.')).toBeInTheDocument();
  });

  it('un título largo se lee entero', () => {
    const title = 'Toyota Hilux 4x4 SRX 2.8 TDI cabina doble automática 2021, 62.000 km, color blanco perla, único dueño';
    render(<LoteIdentity lote={makeLote({ title })} />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('si la descripción entra, no ofrece "Ver más"', () => {
    simulateOverflow(40, 40);
    render(<LoteIdentity lote={makeLote()} />);

    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('si la descripción no entra, ofrece "Ver más" y se despliega y se vuelve a recortar', async () => {
    simulateOverflow(200, 60);
    render(<LoteIdentity lote={makeLote({ description: 'Texto largo. '.repeat(60) })} />);

    const toggle = screen.getByRole('button', { name: 'Ver más' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Texto largo/)).toHaveClass('line-clamp-3');

    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Texto largo/)).not.toHaveClass('line-clamp-3');

    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.getByText(/Texto largo/)).toHaveClass('line-clamp-3');
  });

  it('al pasar a otro lote, la descripción vuelve a arrancar recortada', async () => {
    simulateOverflow(200, 60);
    const { rerender } = render(<LoteIdentity lote={makeLote({ description: 'Uno. '.repeat(60) })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeInTheDocument();

    rerender(<LoteIdentity lote={makeLote({ id: 'lote-2', description: 'Dos. '.repeat(60) })} />);

    expect(screen.getByRole('button', { name: 'Ver más' })).toBeInTheDocument();
  });
});
