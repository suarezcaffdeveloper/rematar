import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renderiza el label y el valor formateado', () => {
    render(<StatCard label="Conectados" value={5} formattedValue="5" />);
    expect(screen.getByText('Conectados')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('sin accentClassName, no dibuja la barra de acento', () => {
    const { container } = render(<StatCard label="Total" value={3} formattedValue="3" />);
    expect(container.querySelector('[aria-hidden="true"].rounded-full')).not.toBeInTheDocument();
  });

  it('con accentClassName, dibuja la barra de acento', () => {
    const { container } = render(
      <StatCard label="Total" value={3} formattedValue="3" accentClassName="bg-brand-500" />,
    );
    expect(container.querySelector('.bg-brand-500')).toBeInTheDocument();
  });

  it('por default (showTrend implícito), al subir el valor muestra la flecha', () => {
    const { rerender } = render(<StatCard label="Ofertas" value={1} formattedValue="1" />);
    expect(screen.getByText('1').parentElement?.querySelector('svg')).not.toBeInTheDocument();

    rerender(<StatCard label="Ofertas" value={2} formattedValue="2" />);
    expect(screen.getByText('2').parentElement?.querySelector('svg')).toBeInTheDocument();
  });

  it('con showTrend en false, nunca muestra flecha aunque el valor cambie', () => {
    const { rerender } = render(<StatCard label="Draft" value={1} formattedValue="1" showTrend={false} />);
    rerender(<StatCard label="Draft" value={2} formattedValue="2" showTrend={false} />);

    expect(screen.getByText('2').parentElement?.querySelector('svg')).not.toBeInTheDocument();
  });
});
