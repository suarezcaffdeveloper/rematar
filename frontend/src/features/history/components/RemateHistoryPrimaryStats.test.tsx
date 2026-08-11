import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemateHistoryPrimaryStats } from './RemateHistoryPrimaryStats';
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
    chat_activity: { message_count: 4, deleted_count: 0, participant_count: 2 },
    participants_count: 3,
    generated_at: '2026-07-01T12:00:01Z',
    ...overrides,
  };
}

describe('RemateHistoryPrimaryStats', () => {
  it('muestra los 5 KPIs principales', () => {
    render(<RemateHistoryPrimaryStats detail={makeDetail()} currency="ARS" />);

    expect(screen.getByText('Valor total adjudicado')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('Total de lotes')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2); // "Total de lotes" y "Participantes" coinciden en valor
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
