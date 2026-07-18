import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';

describe('ConnectionStatusBadge', () => {
  it('muestra "Conectado" cuando el estado es "open"', () => {
    render(<ConnectionStatusBadge status="open" />);
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('muestra "Reconectando..." cuando el estado es "reconnecting"', () => {
    render(<ConnectionStatusBadge status="reconnecting" />);
    expect(screen.getByText('Reconectando...')).toBeInTheDocument();
  });

  it('muestra "Desconectado" cuando el estado es "closed"', () => {
    render(<ConnectionStatusBadge status="closed" />);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });

  it('muestra "Conectando..." para "idle"/"connecting"', () => {
    const { rerender } = render(<ConnectionStatusBadge status="idle" />);
    expect(screen.getByText('Conectando...')).toBeInTheDocument();

    rerender(<ConnectionStatusBadge status="connecting" />);
    expect(screen.getByText('Conectando...')).toBeInTheDocument();
  });
});
