import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseRemateAnalyticsResult } from '../hooks';
import type { RemateAnalyticsSnapshot } from '../types';

const useRemateAnalyticsMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useRemateAnalytics: useRemateAnalyticsMock }));

const exportRecentEventsToCsvMock = vi.hoisted(() => vi.fn());
vi.mock('../exportEvents', () => ({ exportRecentEventsToCsv: exportRecentEventsToCsvMock }));

const { AnalyticsPanel } = await import('./AnalyticsPanel');

function makeSnapshot(overrides: Partial<RemateAnalyticsSnapshot> = {}): RemateAnalyticsSnapshot {
  return {
    schema_version: 1,
    remate_id: 'remate-1',
    connected_users_total: 5,
    connected_buyers: 3,
    // Valores deliberadamente distintos entre sí -- varias tarjetas KPI se verifican
    // por su texto exacto (`getByText`), una colisión numérica rompería el test con
    // "found multiple elements" en vez de la aserción real que se quiere probar.
    lote_status_counts: {
      pending: 4,
      open: 0,
      closed_sold: 6,
      closed_unsold: 1,
      cancelled: 0,
      total: 11,
    },
    average_lote_duration_seconds: 90,
    total_awarded_value: '1500.00',
    total_ofertas: 7,
    ofertas_per_minute: 2,
    highest_oferta: {
      oferta_id: 'oferta-1',
      lote_id: 'lote-1',
      lot_number: '1',
      lote_title: 'Toro Angus',
      buyer_id: 'buyer-1',
      amount: '1200.00',
      status: 'accepted',
      created_at: '2026-07-21T10:00:00Z',
    },
    top_lote_by_offers: {
      lote_id: 'lote-1',
      lot_number: '1',
      lote_title: 'Toro Angus',
      offer_count: 4,
    },
    offers_by_lote: [{ lote_id: 'lote-1', offer_count: 4 }],
    bids_timeline: [{ bucket_start: '2026-07-21T10:00:00Z', count: 2 }],
    bids_timeline_granularity: 'minute',
    recent_events: [
      {
        event_type: 'lote.opened',
        occurred_at: '2026-07-21T10:00:00Z',
        lote_id: 'lote-1',
        lot_number: '1',
        lote_title: 'Toro Angus',
        final_price: null,
      },
    ],
    generated_at: '2026-07-21T10:05:00Z',
    ...overrides,
  };
}

function defaultResult(
  overrides: Partial<UseRemateAnalyticsResult> = {},
): UseRemateAnalyticsResult {
  return {
    data: makeSnapshot(),
    isInitialLoading: false,
    initialError: null,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<UseRemateAnalyticsResult> = {}) {
  useRemateAnalyticsMock.mockReturnValue(defaultResult(overrides));
  return render(
    <AnalyticsPanel remateId="remate-1" subscribeToRealtime={() => () => {}} currency="ARS" />,
  );
}

describe('AnalyticsPanel', () => {
  it('mientras carga, muestra esqueletos', () => {
    const { container } = renderPanel({ data: null, isInitialLoading: true });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('ante un error inicial, muestra el mensaje de error', () => {
    renderPanel({
      data: null,
      initialError: { status: 403, code: 'forbidden', message: 'No tenés acceso.' },
    });
    expect(screen.getByText('No se pudo cargar la analítica de este remate.')).toBeInTheDocument();
  });

  it('muestra las tarjetas KPI con los valores del snapshot', () => {
    renderPanel();
    expect(screen.getByText('3')).toBeInTheDocument(); // compradores conectados
    expect(screen.getByText('5')).toBeInTheDocument(); // usuarios activos
    expect(screen.getByText('7')).toBeInTheDocument(); // total de ofertas
  });

  it('formatea el valor total adjudicado como moneda', () => {
    renderPanel();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('muestra la oferta más alta y el lote con más ofertas', () => {
    renderPanel();
    expect(screen.getAllByText(/Lote 1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/4 ofertas/)).toBeInTheDocument();
  });

  it('sin oferta más alta ni lote destacado, muestra el estado vacío', () => {
    renderPanel({ data: makeSnapshot({ highest_oferta: null, top_lote_by_offers: null }) });
    expect(screen.getAllByText('Sin ofertas todavía.')).toHaveLength(2);
  });

  it('sin duración promedio, muestra "--"', () => {
    renderPanel({ data: makeSnapshot({ average_lote_duration_seconds: null }) });
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('con granularidad "minute" (remate Live), titula la sección "Evolución de ofertas"', () => {
    renderPanel({ data: makeSnapshot({ bids_timeline_granularity: 'minute' }) });
    expect(screen.getByText('Evolución de ofertas')).toBeInTheDocument();
  });

  it('con granularidad "hour" (remate Timed), titula la sección "Ofertas por hora, por día"', () => {
    renderPanel({ data: makeSnapshot({ bids_timeline_granularity: 'hour' }) });
    expect(screen.getByText('Ofertas por hora, por día')).toBeInTheDocument();
  });

  it('muestra el progreso de lotes (vendidos/total y restantes)', () => {
    renderPanel();
    expect(screen.getByText('6/11')).toBeInTheDocument(); // closed_sold/total
    expect(screen.getByText(/6 vendidos · 4 restantes/)).toBeInTheDocument(); // pending+open
  });

  it('muestra hace cuánto se actualizó el snapshot', () => {
    renderPanel();
    expect(screen.getByText(/^Actualizado hace/)).toBeInTheDocument();
  });

  it('muestra la leyenda con los tipos de evento presentes en la línea de tiempo', () => {
    renderPanel();
    expect(screen.getByText('1 evento')).toBeInTheDocument(); // badge de conteo
    expect(screen.getAllByText('Lote abierto').length).toBeGreaterThan(0);
  });

  it('sin eventos, no muestra el badge de conteo ni el botón de exportar', () => {
    renderPanel({ data: makeSnapshot({ recent_events: [] }) });
    // Regex ancorada -- el estado vacío de `EventsTimeline` dice "Todavía no hay
    // eventos." y un patrón laxo como /evento/ también matchea esa frase.
    expect(screen.queryByText(/^\d+ eventos?$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });

  it('al exportar, dispara la exportación a CSV con los eventos y la moneda del panel', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(exportRecentEventsToCsvMock).toHaveBeenCalledWith(
      makeSnapshot().recent_events,
      'remate-1',
      'ARS',
    );
  });
});
