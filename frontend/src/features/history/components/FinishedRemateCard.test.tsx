import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinishedRemateCard } from './FinishedRemateCard';
import { formatDateTimeCompact } from '../../../shared/lib/format';
import type { FinishedRemateSummary } from '../types';

function makeRemate(overrides: Partial<FinishedRemateSummary> = {}): FinishedRemateSummary {
  return {
    id: 'remate-1',
    title: 'Remate de hacienda',
    category: 'hacienda',
    status: 'finished',
    starts_at: '2026-07-01T10:00:00Z',
    resolved_at: '2026-07-01T12:00:00Z',
    lote_count: 3,
    lotes_sold_count: 2,
    total_awarded_value: '1500.00',
    buyer_count: 2,
    duration_seconds: 3665,
    owner_id: 'owner-1',
    owner_name: 'Ana Rematadora',
    ...overrides,
  };
}

function renderCard(
  remateOverrides: Partial<FinishedRemateSummary> = {},
  props: Partial<Omit<Parameters<typeof FinishedRemateCard>[0], 'remate'>> = {},
) {
  return render(
    <MemoryRouter>
      <FinishedRemateCard remate={makeRemate(remateOverrides)} {...props} />
    </MemoryRouter>,
  );
}

describe('FinishedRemateCard', () => {
  it('muestra título, categoría y KPIs resumidos', () => {
    renderCard();
    expect(screen.getByText('Remate de hacienda')).toBeInTheDocument();
    expect(screen.getByText('Hacienda')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('67% vendidos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // compradores
    expect(screen.getByText(formatDateTimeCompact('2026-07-01T12:00:00Z'))).toBeInTheDocument();
  });

  it('remate finalizado, no muestra la etiqueta de estado (sería redundante)', () => {
    renderCard({ status: 'finished' });
    expect(screen.queryByText('Finalizado')).not.toBeInTheDocument();
  });

  it('remate cancelado, sí muestra la etiqueta de estado', () => {
    renderCard({ status: 'cancelled' });
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('sin showOwner, no muestra el nombre del dueño', () => {
    renderCard({}, { showOwner: false });
    expect(screen.queryByText(/Ana Rematadora/)).not.toBeInTheDocument();
  });

  it('con showOwner, muestra el nombre del dueño', () => {
    renderCard({}, { showOwner: true });
    expect(screen.getByText(/Ana Rematadora/)).toBeInTheDocument();
  });

  it('enlaza al detalle histórico del remate', () => {
    renderCard();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/remates/remate-1/historial');
  });

  it('sin duración registrada, muestra un guión', () => {
    renderCard({ duration_seconds: null });
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
