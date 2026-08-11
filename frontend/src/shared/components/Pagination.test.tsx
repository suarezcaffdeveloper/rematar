import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('con una sola página, no renderiza nada', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con pocas páginas, las muestra todas sin "…"', () => {
    render(<Pagination page={1} totalPages={4} onPageChange={vi.fn()} />);
    ['1', '2', '3', '4'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Ir a la página ${label}` })).toBeInTheDocument();
    });
    expect(screen.queryByText('…')).not.toBeInTheDocument();
  });

  it('en la primera página de muchas, muestra "1 2 3 … N"', () => {
    render(<Pagination page={1} totalPages={10} onPageChange={vi.fn()} />);
    ['1', '2', '3', '10'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Ir a la página ${label}` })).toBeInTheDocument();
    });
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a la página 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('en una página intermedia, muestra vecinos a ambos lados con dos "…"', () => {
    render(<Pagination page={5} totalPages={10} onPageChange={vi.fn()} />);
    ['1', '4', '5', '6', '10'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Ir a la página ${label}` })).toBeInTheDocument();
    });
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('en la última página, muestra "1 … N-2 N-1 N"', () => {
    render(<Pagination page={10} totalPages={10} onPageChange={vi.fn()} />);
    ['1', '8', '9', '10'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Ir a la página ${label}` })).toBeInTheDocument();
    });
  });

  it('la flecha "anterior" está deshabilitada en la primera página, "siguiente" no', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled();
  });

  it('la flecha "siguiente" está deshabilitada en la última página', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('clickear un número o una flecha llama a onPageChange con la página correcta', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ir a la página 4' }));
    expect(onPageChange).toHaveBeenCalledWith(4);

    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });
});
