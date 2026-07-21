import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventsTimeline } from './EventsTimeline';
import type { RecentAnalyticsEvent } from '../types';

function makeEvent(overrides: Partial<RecentAnalyticsEvent> = {}): RecentAnalyticsEvent {
  return {
    event_type: 'lote.opened',
    occurred_at: '2026-07-21T10:00:00Z',
    lote_id: 'lote-1',
    lot_number: '1',
    lote_title: 'Toro Angus',
    final_price: null,
    ...overrides,
  };
}

describe('EventsTimeline', () => {
  it('sin eventos, muestra el mensaje de "todavía no hay eventos"', () => {
    render(<EventsTimeline events={[]} />);
    expect(screen.getByText('Todavía no hay eventos.')).toBeInTheDocument();
  });

  it('muestra la etiqueta correcta para cada tipo de evento, con el número de lote', () => {
    const events = [
      makeEvent({ event_type: 'lote.opened', lot_number: '1' }),
      makeEvent({ event_type: 'lote.closed_sold', lot_number: '2' }),
      makeEvent({ event_type: 'lote.closed_unsold', lot_number: '3' }),
      makeEvent({ event_type: 'remate.finished', lote_id: null, lot_number: null, lote_title: null }),
    ];
    render(<EventsTimeline events={events} />);

    expect(screen.getByText('Lote abierto')).toBeInTheDocument();
    expect(screen.getByText('Lote vendido')).toBeInTheDocument();
    expect(screen.getByText('Lote desierto')).toBeInTheDocument();
    expect(screen.getByText('Remate finalizado')).toBeInTheDocument();
    expect(screen.getByText('-- Lote 1')).toBeInTheDocument();
    expect(screen.getByText('-- Lote 2')).toBeInTheDocument();
  });

  it('un evento sin número de lote (remate.finished/cancelled) no muestra "-- Lote"', () => {
    render(
      <EventsTimeline
        events={[makeEvent({ event_type: 'remate.cancelled', lote_id: null, lot_number: null, lote_title: null })]}
      />,
    );
    expect(screen.queryByText(/-- Lote/)).not.toBeInTheDocument();
  });
});
