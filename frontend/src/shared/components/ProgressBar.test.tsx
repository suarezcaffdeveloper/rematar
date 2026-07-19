import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('refleja el porcentaje en aria-valuenow', () => {
    render(<ProgressBar percent={42} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('recorta valores fuera de rango a 0-100', () => {
    const { rerender } = render(<ProgressBar percent={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar percent={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('muestra el label cuando se pasa', () => {
    render(<ProgressBar percent={50} label="Subiendo foto1.jpg" />);
    expect(screen.getByText('Subiendo foto1.jpg')).toBeInTheDocument();
  });
});
