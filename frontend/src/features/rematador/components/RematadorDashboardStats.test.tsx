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
    category: 'mercaderia_e_indumentaria',
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

    // Épica 9, Etapa 3: `StatCard` (reemplaza al `StatChip` local) dibuja el label
    // primero y el valor después -- orden inverso al que tenía `StatChip`.
    expect(screen.getByText('Total').nextElementSibling?.textContent).toBe('4');
    expect(screen.getByText('En vivo').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Programado').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Borrador').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Finalizado').nextElementSibling?.textContent).toBe('0');
  });

  it('sin remates, todos los contadores quedan en 0', () => {
    render(<RematadorDashboardStats remates={[]} />);
    expect(screen.getByText('Total').nextElementSibling?.textContent).toBe('0');
  });
});
