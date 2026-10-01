import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BidsTimelineChart } from './BidsTimelineChart';
import { formatDateShort, formatDateTimeCompact } from '../../../shared/lib/format';
import type { BidsTimelineBucket } from '../types';

function makeBucket(overrides: Partial<BidsTimelineBucket> = {}): BidsTimelineBucket {
  return { bucket_start: '2026-07-21T10:00:00Z', count: 0, ...overrides };
}

describe('BidsTimelineChart', () => {
  it('sin datos, muestra el mensaje de "todavía no hay ofertas"', () => {
    render(<BidsTimelineChart buckets={[]} granularity="minute" />);
    expect(screen.getByText('Todavía no hay ofertas.')).toBeInTheDocument();
  });

  it('renderiza una línea y un área únicas, más un área de hover por cada bucket (zero-filled incluido)', () => {
    const buckets = [
      makeBucket({ bucket_start: '2026-07-21T10:00:00Z', count: 0 }),
      makeBucket({ bucket_start: '2026-07-21T10:01:00Z', count: 3 }),
      makeBucket({ bucket_start: '2026-07-21T10:02:00Z', count: 0 }),
    ];
    const { container } = render(<BidsTimelineChart buckets={buckets} granularity="minute" />);
    expect(container.querySelector('[data-testid="bids-timeline-line"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="bids-timeline-area"]')).toBeInTheDocument();
    expect(container.querySelectorAll('rect.fill-transparent')).toHaveLength(3);
  });

  it('cada barra tiene un tooltip con la hora y el conteo', () => {
    render(<BidsTimelineChart buckets={[makeBucket({ count: 5 })]} granularity="minute" />);
    expect(screen.getByText(/5 ofertas/)).toBeInTheDocument();
  });

  it('usa singular cuando el conteo es 1', () => {
    render(<BidsTimelineChart buckets={[makeBucket({ count: 1 })]} granularity="minute" />);
    expect(screen.getByText(/1 oferta$/)).toBeInTheDocument();
  });

  describe('granularidad horaria (remates Timed, varios días)', () => {
    /** 3 días locales completos, 24 buckets cada uno -- simula un remate Timed en curso.
     * Construye cada hora a partir de componentes locales (`new Date(y, m, d, h)`), no de
     * un string ISO en UTC, para que el día calendario resultante no dependa de la zona
     * horaria en la que corran los tests (evita el caso donde una hora cercana a
     * medianoche UTC cae en el día anterior/siguiente en hora local). */
    function makeHourlyBuckets(): BidsTimelineBucket[] {
      const buckets: BidsTimelineBucket[] = [];
      for (let day = 21; day <= 23; day += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
          const iso = new Date(2026, 6, day, hour).toISOString();
          buckets.push(makeBucket({ bucket_start: iso, count: hour === 12 ? 4 : 0 }));
        }
      }
      return buckets;
    }

    it('renderiza un área de hover por cada bucket horario', () => {
      const buckets = makeHourlyBuckets();
      const { container } = render(<BidsTimelineChart buckets={buckets} granularity="hour" />);
      expect(container.querySelectorAll('rect.fill-transparent')).toHaveLength(buckets.length);
    });

    it('dibuja un separador por cada cambio de día (2 cambios en 3 días)', () => {
      const buckets = makeHourlyBuckets();
      const { container } = render(<BidsTimelineChart buckets={buckets} granularity="hour" />);
      expect(container.querySelectorAll('rect.fill-slate-300')).toHaveLength(2);
    });

    it('muestra una etiqueta de fecha por cada uno de los 3 días', () => {
      const buckets = makeHourlyBuckets();
      render(<BidsTimelineChart buckets={buckets} granularity="hour" />);
      expect(screen.getByText(formatDateShort(buckets[0].bucket_start))).toBeInTheDocument();
      expect(screen.getByText(formatDateShort(buckets[24].bucket_start))).toBeInTheDocument();
      expect(screen.getByText(formatDateShort(buckets[48].bucket_start))).toBeInTheDocument();
    });

    it('el tooltip de una barra horaria incluye la fecha, no solo la hora', () => {
      const buckets = makeHourlyBuckets();
      const noonBucket = buckets[12];
      render(<BidsTimelineChart buckets={buckets} granularity="hour" />);
      expect(
        screen.getByText(`${formatDateTimeCompact(noonBucket.bucket_start)} -- 4 ofertas`),
      ).toBeInTheDocument();
    });
  });
});
