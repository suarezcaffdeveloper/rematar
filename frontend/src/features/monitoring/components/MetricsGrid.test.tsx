import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricsGrid } from './MetricsGrid';
import type { PlatformMetrics } from '../types';

function makeMetrics(overrides: Partial<PlatformMetrics> = {}): PlatformMetrics {
  return {
    connected_users: 3,
    active_websockets: 4,
    chat_messages_per_minute: 2,
    ofertas_per_minute: 1,
    avg_oferta_processing_ms: 12.5,
    avg_api_response_ms: 45.2,
    errors_last_minute: 0,
    memory_usage_mb: 128.3,
    cpu_usage_percent: 5.25,
    generated_at: '2026-07-22T00:00:00Z',
    ...overrides,
  };
}

describe('MetricsGrid', () => {
  it('muestra los conteos tal cual', () => {
    render(<MetricsGrid metrics={makeMetrics()} />);
    expect(screen.getByText('Usuarios conectados')).toBeInTheDocument();
    expect(screen.getByText('WebSockets activos')).toBeInTheDocument();
  });

  it('formatea tiempos en milisegundos', () => {
    render(<MetricsGrid metrics={makeMetrics()} />);
    expect(screen.getByText('13 ms')).toBeInTheDocument(); // 12.5 redondeado
    expect(screen.getByText('45 ms')).toBeInTheDocument();
  });

  it('formatea memoria y CPU', () => {
    render(<MetricsGrid metrics={makeMetrics()} />);
    expect(screen.getByText('128 MB')).toBeInTheDocument();
    expect(screen.getByText('5.3%')).toBeInTheDocument();
  });

  it('sin datos de timing/recursos (null), muestra un guión sin romper', () => {
    render(
      <MetricsGrid
        metrics={makeMetrics({
          avg_oferta_processing_ms: null,
          avg_api_response_ms: null,
          memory_usage_mb: null,
          cpu_usage_percent: null,
        })}
      />,
    );
    expect(screen.getAllByText('—')).toHaveLength(4);
  });
});
