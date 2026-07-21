import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BidsTimelineChart } from './BidsTimelineChart';
import type { BidsTimelineBucket } from '../types';

function makeBucket(overrides: Partial<BidsTimelineBucket> = {}): BidsTimelineBucket {
  return { bucket_start: '2026-07-21T10:00:00Z', count: 0, ...overrides };
}

describe('BidsTimelineChart', () => {
  it('sin datos, muestra el mensaje de "todavía no hay ofertas"', () => {
    render(<BidsTimelineChart buckets={[]} />);
    expect(screen.getByText('Todavía no hay ofertas.')).toBeInTheDocument();
  });

  it('renderiza una barra por cada bucket recibido, incluidos los vacíos (zero-filled)', () => {
    const buckets = [
      makeBucket({ bucket_start: '2026-07-21T10:00:00Z', count: 0 }),
      makeBucket({ bucket_start: '2026-07-21T10:01:00Z', count: 3 }),
      makeBucket({ bucket_start: '2026-07-21T10:02:00Z', count: 0 }),
    ];
    const { container } = render(<BidsTimelineChart buckets={buckets} />);
    expect(container.querySelectorAll('rect.fill-brand-500')).toHaveLength(3);
  });

  it('cada barra tiene un tooltip con la hora y el conteo', () => {
    render(<BidsTimelineChart buckets={[makeBucket({ count: 5 })]} />);
    expect(screen.getByText(/5 ofertas/)).toBeInTheDocument();
  });

  it('usa singular cuando el conteo es 1', () => {
    render(<BidsTimelineChart buckets={[makeBucket({ count: 1 })]} />);
    expect(screen.getByText(/1 oferta$/)).toBeInTheDocument();
  });
});
