import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthStatusPanel } from './HealthStatusPanel';
import type { HealthCheckResponse } from '../types';

function makeHealth(overrides: Partial<HealthCheckResponse> = {}): HealthCheckResponse {
  return {
    status: 'ok',
    checks: [
      { component: 'api', status: 'ok', detail: null },
      { component: 'postgres', status: 'ok', detail: null },
      { component: 'redis', status: 'ok', detail: null },
      { component: 'websocket', status: 'ok', detail: '3 conexiones activas' },
    ],
    generated_at: '2026-07-22T00:00:00Z',
    ...overrides,
  };
}

describe('HealthStatusPanel', () => {
  it('muestra los cuatro componentes con su estado', () => {
    render(<HealthStatusPanel health={makeHealth()} />);

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('WebSocket')).toBeInTheDocument();
    expect(screen.getAllByText('OK')).toHaveLength(5); // estado general + 4 componentes
  });

  it('muestra el detalle informativo cuando existe', () => {
    render(<HealthStatusPanel health={makeHealth()} />);
    expect(screen.getByText('3 conexiones activas')).toBeInTheDocument();
  });

  it('un componente caído se refleja como "No disponible", sin ocultar a los demás', () => {
    const health = makeHealth({
      status: 'degraded',
      checks: [
        { component: 'api', status: 'ok', detail: null },
        { component: 'postgres', status: 'unavailable', detail: 'timeout' },
        { component: 'redis', status: 'ok', detail: null },
        { component: 'websocket', status: 'ok', detail: '0 conexiones activas' },
      ],
    });
    render(<HealthStatusPanel health={health} />);

    expect(screen.getByText('Degradado')).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });
});
