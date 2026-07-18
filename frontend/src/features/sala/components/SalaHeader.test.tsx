import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalaHeader } from './SalaHeader';
import type { Remate } from '../../remates/types';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('SalaHeader', () => {
  it('muestra el título, la cantidad de conectados y el estado de conexión', () => {
    render(<SalaHeader remate={makeRemate()} connectedUsers={5} connectionStatus="open" />);

    expect(screen.getByRole('heading', { name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('5 conectados')).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('muestra "Reconectando..." cuando se cayó la conexión y está reintentando', () => {
    render(<SalaHeader remate={makeRemate()} connectedUsers={5} connectionStatus="reconnecting" />);
    expect(screen.getByText('Reconectando...')).toBeInTheDocument();
  });
});
