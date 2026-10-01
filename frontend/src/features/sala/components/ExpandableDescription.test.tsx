import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpandableDescription } from './ExpandableDescription';

/** jsdom no maneja layout: `scrollHeight`/`clientHeight` se simulan para forzar el recorte. */
function mockOverflow(overflowing: boolean) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(overflowing ? 200 : 40);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExpandableDescription', () => {
  it('una descripción corta se muestra entera, sin "Ver más"', () => {
    mockOverflow(false);

    render(<ExpandableDescription text="Un toro." resetKey="lote-1" />);

    expect(screen.getByText('Un toro.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('una descripción que no entra ofrece "Ver más" y se despliega y se vuelve a recortar', async () => {
    mockOverflow(true);

    render(<ExpandableDescription text="Un texto larguísimo." resetKey="lote-1" />);
    const paragraph = screen.getByText('Un texto larguísimo.');
    expect(paragraph).toHaveClass('line-clamp-3');

    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(paragraph).not.toHaveClass('line-clamp-3');
    expect(paragraph).toHaveClass('whitespace-pre-line');

    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(paragraph).toHaveClass('line-clamp-3');
  });

  it('se puede recortar a cuatro renglones', () => {
    mockOverflow(false);

    render(<ExpandableDescription text="Texto." resetKey="lote-1" lines={4} />);

    expect(screen.getByText('Texto.')).toHaveClass('line-clamp-4');
  });

  it('al pasar a otro lote vuelve a arrancar recortada', async () => {
    mockOverflow(true);
    const { rerender } = render(<ExpandableDescription text="Texto uno." resetKey="lote-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeInTheDocument();

    rerender(<ExpandableDescription text="Texto dos." resetKey="lote-2" />);

    expect(screen.getByRole('button', { name: 'Ver más' })).toBeInTheDocument();
  });

  it('sin texto, avisa que todavía no hay descripción', () => {
    mockOverflow(false);

    render(<ExpandableDescription text={null} resetKey="lote-1" />);

    expect(screen.getByText('Este lote todavía no tiene una descripción cargada.')).toBeInTheDocument();
  });
});
