import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceCounter } from './PresenceCounter';

describe('PresenceCounter', () => {
  it('muestra el conteo en singular cuando es 1', () => {
    render(<PresenceCounter count={1} />);
    expect(screen.getByText('1 conectado')).toBeInTheDocument();
  });

  it('muestra el conteo en plural cuando es distinto de 1', () => {
    render(<PresenceCounter count={5} />);
    expect(screen.getByText('5 conectados')).toBeInTheDocument();
  });

  it('muestra "0 conectados" sin romper', () => {
    render(<PresenceCounter count={0} />);
    expect(screen.getByText('0 conectados')).toBeInTheDocument();
  });

  it('al cambiar el conteo, actualiza el número mostrado', () => {
    const { rerender } = render(<PresenceCounter count={3} />);
    expect(screen.getByText('3 conectados')).toBeInTheDocument();

    rerender(<PresenceCounter count={4} />);
    expect(screen.getByText('4 conectados')).toBeInTheDocument();
    expect(screen.queryByText('3 conectados')).not.toBeInTheDocument();
  });
});
