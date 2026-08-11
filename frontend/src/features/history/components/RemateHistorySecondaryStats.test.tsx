import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemateHistorySecondaryStats } from './RemateHistorySecondaryStats';
import type { RemateHistoryDetail } from '../types';

function makeDetail(overrides: Partial<RemateHistoryDetail> = {}): RemateHistoryDetail {
  return {
    remate_id: 'remate-1',
    title: 'Remate de prueba',
    category: 'hacienda',
    status: 'finished',
    starts_at: '2026-07-01T10:00:00Z',
    finished_at: '2026-07-01T12:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    duration_seconds: 3600,
    lote_status_counts: { pending: 0, open: 0, closed_sold: 2, closed_unsold: 1, cancelled: 0, total: 3 },
    average_lote_duration_seconds: 120,
    total_awarded_value: '1500.00',
    total_ofertas: 5,
    highest_oferta: null,
    top_lote_by_offers: null,
    chat_activity: { message_count: 12, deleted_count: 1, participant_count: 4 },
    participants_count: 3,
    generated_at: '2026-07-01T12:00:01Z',
    ...overrides,
  };
}

describe('RemateHistorySecondaryStats', () => {
  it('muestra tiempos y actividad del chat (absorbe lo que antes era ChatActivityCard)', () => {
    render(<RemateHistorySecondaryStats detail={makeDetail()} currency="ARS" />);

    expect(screen.getByText('Duración total')).toBeInTheDocument();
    expect(screen.getByText('Mensajes de chat')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Participantes del chat')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Mensajes moderados')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('sin oferta más alta ni duración promedio, muestra placeholders sin romper', () => {
    render(
      <RemateHistorySecondaryStats
        detail={makeDetail({ highest_oferta: null, average_lote_duration_seconds: null })}
        currency="ARS"
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
