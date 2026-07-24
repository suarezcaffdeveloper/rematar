import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LoteCountdown } from './LoteCountdown';

const NOW = new Date('2026-08-01T00:00:00Z');

describe('LoteCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin timer configurado (ambos campos null), no renderiza nada', () => {
    const { container } = render(<LoteCountdown endsAt={null} pausedRemainingSeconds={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('corriendo, muestra el tiempo restante en formato mm:ss', () => {
    const endsAt = new Date(NOW.getTime() + 90_000).toISOString(); // 1:30
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1:30');
    expect(screen.getByText('Tiempo restante')).toBeInTheDocument();
  });

  it('tictac local: al avanzar el reloj, el conteo baja sin nueva prop', () => {
    const endsAt = new Date(NOW.getTime() + 5_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:05');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('0:02');
  });

  it('pausado, muestra el valor congelado y la etiqueta "Timer pausado", sin tictac', () => {
    render(<LoteCountdown endsAt={null} pausedRemainingSeconds={42} />);
    expect(screen.getByText('Timer pausado')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('0:42');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('0:42');
  });

  it('bajo el umbral urgente (<=10s), aplica el estilo de urgencia', () => {
    const endsAt = new Date(NOW.getTime() + 8_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveClass('text-danger-600');
  });

  it('por encima del umbral urgente, no aplica el estilo de urgencia', () => {
    const endsAt = new Date(NOW.getTime() + 60_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).not.toHaveClass('text-danger-600');
  });

  it('nunca baja de 0:00 aunque el deadline ya haya pasado', () => {
    const endsAt = new Date(NOW.getTime() - 5_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
  });

  it('el número grande no lleva aria-live (evita que un lector de pantalla anuncie el tictac cada segundo)', () => {
    const endsAt = new Date(NOW.getTime() + 30_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).not.toHaveAttribute('aria-live');
  });

  it('al cruzar el umbral urgente, anuncia una única vez en la región sr-only separada', () => {
    const endsAt = new Date(NOW.getTime() + 12_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);

    act(() => {
      vi.advanceTimersByTime(3000); // 12s -> 9s, cruza el umbral de 10s
    });
    expect(screen.getByText('Quedan 9 segundos.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000); // 8s, sigue urgente -- no debería repetir el anuncio
    });
    expect(screen.getByText('Quedan 9 segundos.')).toBeInTheDocument();
  });

  it('al llegar a cero, anuncia "Tiempo agotado."', () => {
    const endsAt = new Date(NOW.getTime() + 2_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Tiempo agotado.')).toBeInTheDocument();
  });
});
