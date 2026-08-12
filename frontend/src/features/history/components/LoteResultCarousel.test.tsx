import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoteResultCarousel } from './LoteResultCarousel';
import type { Lote } from '../../remates/types';

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
    final_price: '1200.00',
    status: 'closed_sold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderCarousel(lotes: Lote[]) {
  return render(
    <MemoryRouter>
      <LoteResultCarousel lotes={lotes} currency="ARS" offerResults={new Map()} casesByLoteId={new Map()} />
    </MemoryRouter>,
  );
}

describe('LoteResultCarousel', () => {
  beforeEach(() => {
    // jsdom no implementa `scrollBy` -- alcanza con que exista para que el handler no
    // explote al hacer click, no hace falta que mueva el scroll de verdad acá.
    HTMLElement.prototype.scrollBy = vi.fn();
  });

  it('sin lotes, no renderiza nada', () => {
    const { container } = renderCarousel([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza el título y todas las cards de lote', () => {
    renderCarousel([makeLote({ id: 'lote-1', lot_number: '1' }), makeLote({ id: 'lote-2', lot_number: '2' })]);

    expect(screen.getByRole('heading', { name: 'Resultado de cada lote' })).toBeInTheDocument();
    expect(screen.getByText('Lote 1')).toBeInTheDocument();
    expect(screen.getByText('Lote 2')).toBeInTheDocument();
  });

  it('con un único lote, no muestra las flechas de navegación', () => {
    renderCarousel([makeLote()]);

    expect(screen.queryByRole('button', { name: 'Lote anterior' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lote siguiente' })).not.toBeInTheDocument();
  });

  it('con más de un lote, muestra ambas flechas', () => {
    renderCarousel([makeLote({ id: 'lote-1' }), makeLote({ id: 'lote-2' })]);

    expect(screen.getByRole('button', { name: 'Lote anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lote siguiente' })).toBeInTheDocument();
  });

  it('la flecha "anterior" empieza deshabilitada (no hay nada previo al inicio)', () => {
    renderCarousel([makeLote({ id: 'lote-1' }), makeLote({ id: 'lote-2' })]);
    expect(screen.getByRole('button', { name: 'Lote anterior' })).toBeDisabled();
  });

  it('click en "siguiente" desplaza el riel un ancho de card', async () => {
    const user = userEvent.setup();
    // Simula que hay más contenido del que entra en el viewport (jsdom deja todo en 0
    // por default) -- así `canScrollNext` da `true` y el botón queda habilitado.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, value: 900 });

    renderCarousel([makeLote({ id: 'lote-1' }), makeLote({ id: 'lote-2' }), makeLote({ id: 'lote-3' })]);

    const nextButton = screen.getByRole('button', { name: 'Lote siguiente' });
    expect(nextButton).not.toBeDisabled();

    await user.click(nextButton);

    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: 'smooth' }),
    );
  });
});
