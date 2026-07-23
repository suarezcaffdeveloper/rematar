import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RematadorDashboardStats } from './RematadorDashboardStats';
import type { Remate } from '../../remates/types';

function makeRemate(overrides: Partial<Remate>): Remate {
  return {
    id: overrides.id ?? 'id',
    owner_id: 'owner-1',
    title: 'Remate',
    description: null,
    category: 'otros',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'draft',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('RematadorDashboardStats', () => {
  it('cuenta los remates por estado, más el total', () => {
    const remates = [
      makeRemate({ id: 'a', status: 'live' }),
      makeRemate({ id: 'b', status: 'live' }),
      makeRemate({ id: 'c', status: 'scheduled' }),
      makeRemate({ id: 'd', status: 'draft' }),
    ];

    render(<RematadorDashboardStats remates={remates} />);

    expect(screen.getByText('Total').previousElementSibling?.textContent).toBe('4');
    expect(screen.getByText('En vivo').previousElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Programado').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Borrador').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Finalizado').previousElementSibling?.textContent).toBe('0');
  });

  it('sin remates, todos los contadores quedan en 0', () => {
    render(<RematadorDashboardStats remates={[]} />);
    expect(screen.getByText('Total').previousElementSibling?.textContent).toBe('0');
  });
});
