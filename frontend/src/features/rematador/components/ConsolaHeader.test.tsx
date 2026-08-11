import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsolaHeader } from './ConsolaHeader';
import type { Remate } from '../../remates/types';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda en vivo',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-08-01T14:00:00Z',
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderHeader(props: Parameters<typeof ConsolaHeader>[0]) {
  return render(<ConsolaHeader {...props} />);
}

describe('ConsolaHeader', () => {
  it('muestra únicamente título, estado, fecha, tiempo transcurrido y conectados', () => {
    renderHeader({ remate: makeRemate(), connectedUsers: 12, connectionStatus: 'open' });

    expect(screen.getByRole('heading', { name: 'Remate de hacienda en vivo' })).toBeInTheDocument();
    expect(screen.getByText('En vivo')).toBeInTheDocument();
    expect(screen.getByText('12 conectados')).toBeInTheDocument();
  });

  it('con la conexión abierta, no muestra ningún indicador de conexión (encabezado limpio)', () => {
    renderHeader({ remate: makeRemate(), connectedUsers: 0, connectionStatus: 'open' });
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
  });

  it('muestra "Reconectando..." mientras el WebSocket se reestablece', () => {
    renderHeader({ remate: makeRemate(), connectedUsers: 0, connectionStatus: 'reconnecting' });
    expect(screen.getByText('Reconectando...')).toBeInTheDocument();
  });

  it('en "scheduled", no muestra tiempo transcurrido', () => {
    renderHeader({ remate: makeRemate({ status: 'scheduled' }), connectedUsers: 0, connectionStatus: 'open' });
    expect(screen.queryByTitle('Tiempo transcurrido desde la fecha programada')).not.toBeInTheDocument();
  });

  it('ya no ofrece un botón "Salir" -- la navegación de vuelta vive en el Sidebar global, siempre visible', () => {
    renderHeader({ remate: makeRemate(), connectedUsers: 0, connectionStatus: 'open' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
