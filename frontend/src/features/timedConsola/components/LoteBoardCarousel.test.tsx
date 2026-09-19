import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteBoardCarousel } from './LoteBoardCarousel';

function items(count: number) {
  return Array.from({ length: count }, (_, index) => <div key={index}>Lote {index + 1}</div>);
}

/** jsdom no hace layout: se fijan a mano las medidas que lee el carrusel. */
function mockLayout(scroller: HTMLElement, { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: clientWidth });
}

function renderCarousel(count: number, layout?: { scrollWidth: number; clientWidth: number }) {
  const view = render(<LoteBoardCarousel label="Lotes del remate">{items(count)}</LoteBoardCarousel>);
  const scroller = screen.getByRole('region').lastElementChild as HTMLElement;
  scroller.scrollBy = vi.fn();
  if (layout) {
    mockLayout(scroller, layout);
    fireEvent.scroll(scroller);
  }
  return { ...view, scroller };
}

describe('LoteBoardCarousel', () => {
  it('renderiza todos los lotes dentro de una región de carrusel', () => {
    renderCarousel(6);
    expect(screen.getByRole('region', { name: 'Lotes del remate' })).toHaveAttribute('aria-roledescription', 'carrusel');
    expect(screen.getAllByText(/^Lote \d$/)).toHaveLength(6);
  });

  it('si todo entra en pantalla, no muestra flechas ni contador', () => {
    renderCarousel(3, { scrollWidth: 1000, clientWidth: 1000 });
    expect(screen.queryByRole('button', { name: 'Lotes siguientes' })).not.toBeInTheDocument();
    expect(screen.queryByText(/ de 3$/)).not.toBeInTheDocument();
  });

  it('con más lotes de los visibles, muestra flechas: "anterior" arranca deshabilitada', () => {
    renderCarousel(8, { scrollWidth: 2000, clientWidth: 1000 });
    expect(screen.getByRole('button', { name: 'Lotes anteriores' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lotes siguientes' })).toBeEnabled();
    expect(screen.getByText(/de 8$/)).toBeInTheDocument();
  });

  it('"siguiente" desplaza una página completa con animación suave', async () => {
    const { scroller } = renderCarousel(8, { scrollWidth: 2000, clientWidth: 1000 });
    await userEvent.click(screen.getByRole('button', { name: 'Lotes siguientes' }));
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
  });

  it('al llegar al final, "siguiente" se deshabilita y "anterior" se habilita', () => {
    const { scroller } = renderCarousel(8, { scrollWidth: 2000, clientWidth: 1000 });
    scroller.scrollLeft = 1000;
    fireEvent.scroll(scroller);
    expect(screen.getByRole('button', { name: 'Lotes siguientes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lotes anteriores' })).toBeEnabled();
  });
});
