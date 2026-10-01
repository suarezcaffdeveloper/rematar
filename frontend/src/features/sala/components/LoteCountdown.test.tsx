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

  it('corriendo, muestra minutos grandes y segundos chicos por separado', () => {
    const endsAt = new Date(NOW.getTime() + 90_000).toISOString(); // 1m30s
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1m30s');
    expect(screen.getByText('Tiempo restante')).toBeInTheDocument();
  });

  it('con días y horas, los antepone al minuto (todo en el número grande)', () => {
    const endsAt = new Date(NOW.getTime() + (3 * 86_400 + 4 * 3_600 + 12 * 60 + 45) * 1000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('3d 04h 12m45s');
  });

  it('tictac local: al avanzar el reloj, el conteo baja sin nueva prop', () => {
    const endsAt = new Date(NOW.getTime() + 5_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0m05s');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('0m02s');
  });

  it('pausado, muestra el valor congelado y la etiqueta "Timer pausado", sin tictac', () => {
    render(<LoteCountdown endsAt={null} pausedRemainingSeconds={42} />);
    expect(screen.getByText('Timer pausado')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('0m42s');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('0m42s');
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

  it('nunca baja de 0m00s aunque el deadline ya haya pasado', () => {
    const endsAt = new Date(NOW.getTime() - 5_000).toISOString();
    render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0m00s');
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

  describe('variant="boxed"', () => {
    it('muestra cuatro cajas (días/horas/min/seg) con cero a la izquierda', () => {
      const endsAt = new Date(NOW.getTime() + (3 * 86_400 + 4 * 3_600 + 12 * 60 + 5) * 1000).toISOString();
      render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} variant="boxed" />);

      const timer = screen.getByRole('timer');
      expect(timer).toHaveTextContent('03');
      expect(timer).toHaveTextContent('04');
      expect(timer).toHaveTextContent('12');
      expect(timer).toHaveTextContent('05');
      expect(screen.getByText('Días')).toBeInTheDocument();
      expect(screen.getByText('Horas')).toBeInTheDocument();
      expect(screen.getByText('Min')).toBeInTheDocument();
      expect(screen.getByText('Seg')).toBeInTheDocument();
    });

    it('bajo el umbral urgente, aplica el estilo de urgencia', () => {
      const endsAt = new Date(NOW.getTime() + 8_000).toISOString();
      render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} variant="boxed" />);
      expect(screen.getByRole('timer')).toHaveClass('animate-pulse');
    });

    it('pausado, muestra el valor congelado en las cajas', () => {
      render(<LoteCountdown endsAt={null} pausedRemainingSeconds={42} variant="boxed" />);
      expect(screen.getByText('Timer pausado')).toBeInTheDocument();
      expect(screen.getByRole('timer')).toHaveTextContent('42');
    });
  });

  describe('variant="inline"', () => {
    it('muestra el tiempo en una sola línea, sin label de tres renglones ni caja', () => {
      const endsAt = new Date(NOW.getTime() + (2 * 3_600 + 5 * 60 + 9) * 1000).toISOString();
      render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} variant="inline" />);

      const timer = screen.getByRole('timer');
      expect(timer).toHaveTextContent('2h 05m');
      expect(timer).toHaveTextContent('09s');
      expect(screen.queryByText('Tiempo restante')).not.toBeInTheDocument();
    });

    it('bajo el umbral urgente, cambia a estilo de urgencia', () => {
      const endsAt = new Date(NOW.getTime() + 8_000).toISOString();
      render(<LoteCountdown endsAt={endsAt} pausedRemainingSeconds={null} variant="inline" />);
      expect(screen.getByRole('timer').parentElement).toHaveClass('animate-pulse');
    });

    it('pausado, indica "Pausado" y muestra el valor congelado', () => {
      render(<LoteCountdown endsAt={null} pausedRemainingSeconds={42} variant="inline" />);
      expect(screen.getByText('Pausado')).toBeInTheDocument();
      expect(screen.getByRole('timer')).toHaveTextContent('42s');
    });

    it('sin timer configurado, no renderiza nada', () => {
      const { container } = render(<LoteCountdown endsAt={null} pausedRemainingSeconds={null} variant="inline" />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('variant="strip" (Sala Timed)', () => {
    const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();

    it('muestra solo las unidades que corresponden: sin días ni horas bajo la hora', () => {
      render(<LoteCountdown endsAt={at(52 * 60 + 9)} pausedRemainingSeconds={null} variant="strip" />);

      const timer = screen.getByRole('timer', { name: 'Tiempo restante' });
      expect(timer).toHaveTextContent('52min09seg');
      expect(timer).not.toHaveTextContent('horas');
      expect(screen.getByText('Cierra en')).toBeInTheDocument();
    });

    it('con días, muestra las cuatro unidades', () => {
      render(
        <LoteCountdown endsAt={at(2 * 86_400 + 3 * 3_600 + 10 * 60 + 5)} pausedRemainingSeconds={null} variant="strip" />,
      );

      expect(screen.getByRole('timer')).toHaveTextContent('02días03horas10min05seg');
    });

    it('bajo el umbral indicado pasa a "Está por cerrar"; sobre el umbral, no', () => {
      const { rerender } = render(
        <LoteCountdown endsAt={at(6 * 60)} pausedRemainingSeconds={null} variant="strip" urgentThresholdSeconds={300} />,
      );
      expect(screen.queryByText('Está por cerrar')).not.toBeInTheDocument();

      rerender(
        <LoteCountdown endsAt={at(4 * 60)} pausedRemainingSeconds={null} variant="strip" urgentThresholdSeconds={300} />,
      );
      expect(screen.getByText('Está por cerrar')).toBeInTheDocument();
    });

    it('si el cierre se corre hacia adelante (oferta sobre el final), avisa "+1 min por oferta final" unos segundos', () => {
      const { rerender } = render(
        <LoteCountdown endsAt={at(30)} pausedRemainingSeconds={null} variant="strip" urgentThresholdSeconds={300} />,
      );
      expect(screen.queryByText('+1 min por oferta final')).not.toBeInTheDocument();

      rerender(
        <LoteCountdown endsAt={at(90)} pausedRemainingSeconds={null} variant="strip" urgentThresholdSeconds={300} />,
      );
      expect(screen.getByText('+1 min por oferta final')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4_100);
      });
      expect(screen.queryByText('+1 min por oferta final')).not.toBeInTheDocument();
    });

    it('pausado, dice "Timer pausado" y muestra el valor congelado', () => {
      render(<LoteCountdown endsAt={null} pausedRemainingSeconds={125} variant="strip" />);

      expect(screen.getByText('Timer pausado')).toBeInTheDocument();
      expect(screen.getByRole('timer')).toHaveTextContent('02min05seg');
    });
  });
});
