import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Remate } from '../../remates/types';
import { SalaRoomHeader, type SalaRoomHeaderProps } from './SalaRoomHeader';

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
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

function renderHeader(overrides: Partial<SalaRoomHeaderProps> = {}) {
  return render(
    <MemoryRouter>
      <SalaRoomHeader
        remate={makeRemate()}
        connectedUsers={12}
        connectionStatus="open"
        backTo="/remates/remate-1"
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('SalaRoomHeader', () => {
  it('muestra el título completo, el estado en vivo y los conectados', () => {
    renderHeader();

    expect(screen.getByRole('heading', { level: 1, name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('En vivo')).toBeInTheDocument();
    expect(screen.getByText('12 conectados')).toBeInTheDocument();
  });

  it('un título largo no se recorta: queda entero en el DOM, sin truncar', () => {
    const longTitle = 'Gran remate de liquidación judicial: flota corporativa de la distribuidora Norte S.A., utilitarios y maquinaria vial';
    renderHeader({ remate: makeRemate({ title: longTitle }) });

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(longTitle);
    expect(heading).not.toHaveClass('truncate');
  });

  it('con la conexión abierta no muestra el aviso de conexión', () => {
    renderHeader();

    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
  });

  it.each([
    ['reconnecting', 'Reconectando...'],
    ['closed', 'Desconectado'],
    ['connecting', 'Conectando...'],
  ] as const)('si la conexión está "%s", avisa "%s"', (status, label) => {
    renderHeader({ connectionStatus: status });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('un remate que no está en vivo muestra su estado y no el punto "en vivo"', () => {
    renderHeader({ remate: makeRemate({ status: 'paused' }) });

    expect(screen.getByText('Pausado')).toBeInTheDocument();
    expect(screen.queryByText('En vivo')).not.toBeInTheDocument();
  });

  it('la flecha vuelve a donde indica backTo', () => {
    renderHeader({ backTo: '/remates/otro' });

    expect(screen.getByRole('link', { name: 'Volver al remate' })).toHaveAttribute('href', '/remates/otro');
  });
});
