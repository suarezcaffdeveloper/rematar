import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Remate } from '../../remates/types';
import { TimedSalaHeader } from './TimedSalaHeader';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-9',
    owner_id: 'owner-1',
    title: 'Remate de fin de temporada',
    description: 'Una descripción larga que la sala no repite.',
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'live',
    auction_type: 'timed',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderHeader(remate: Remate, openCount: number, totalCount: number) {
  return render(
    <MemoryRouter>
      <TimedSalaHeader remate={remate} openCount={openCount} totalCount={totalCount} />
    </MemoryRouter>,
  );
}

describe('TimedSalaHeader', () => {
  it('muestra el título, cuántos lotes siguen abiertos y vuelve a la ficha del remate', () => {
    renderHeader(makeRemate(), 5, 8);

    expect(screen.getByRole('heading', { name: 'Remate de fin de temporada' })).toBeInTheDocument();
    expect(screen.getByText('5 lotes abiertos de 8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al remate' })).toHaveAttribute('href', '/remates/remate-9');
  });

  it('con un solo lote abierto, lo dice en singular', () => {
    renderHeader(makeRemate(), 1, 3);

    expect(screen.getByText('1 lote abierto de 3')).toBeInTheDocument();
  });

  it('dice cuándo termina el remate solo si tiene fecha de cierre', () => {
    const { rerender } = renderHeader(makeRemate(), 1, 1);
    expect(screen.queryByText(/Termina el/)).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <TimedSalaHeader remate={makeRemate({ ends_at: '2026-10-04T22:07:00Z' })} openCount={1} totalCount={1} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Termina el/)).toBeInTheDocument();
  });

  it('no repite la descripción del remate', () => {
    renderHeader(makeRemate(), 1, 1);

    expect(screen.queryByText(/descripción larga/)).not.toBeInTheDocument();
  });
});
