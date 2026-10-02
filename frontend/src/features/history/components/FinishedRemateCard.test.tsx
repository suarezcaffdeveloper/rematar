import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinishedRemateCard } from './FinishedRemateCard';
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
  it('muestra título, categoría, lo vendido y cuántos lotes se vendieron', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('Hacienda y ganadería')).toBeInTheDocument();
    expect(screen.getByText(/1\.500/)).toBeInTheDocument();
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
    expect(screen.getByText(/2 compradores/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 de 3 lotes vendidos' })).toBeInTheDocument();
  });

  it('dice "Finalizado" o "Cancelado" en la portada', () => {
    const { unmount } = renderCard({ status: 'finished' });
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
    unmount();
    renderCard({ status: 'cancelled' });
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('un remate cancelado no muestra montos ni barra, y remite al motivo del resumen', () => {
    renderCard({ status: 'cancelled', total_awarded_value: '0.00', lotes_sold_count: 0 });

    expect(screen.getByText(/Se canceló antes de terminar/)).toBeInTheDocument();
    expect(screen.queryByText('vendidos')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /lotes vendidos/ })).not.toBeInTheDocument();
  });

  it('un remate sin ventas lo dice', () => {
    renderCard({ lotes_sold_count: 0, total_awarded_value: '0.00', buyer_count: 0 });
    expect(screen.getByText('Ningún lote se vendió en este remate.')).toBeInTheDocument();
  });

  it('avisa cuántas ventas quedaron sin cobrar, o que está todo cobrado', () => {
    const { unmount } = renderCard({}, { unpaidCount: 2 });
    expect(screen.getByText('2 ventas sin cobrar')).toBeInTheDocument();
    unmount();
    const second = renderCard({}, { unpaidCount: 1 });
    expect(screen.getByText('1 venta sin cobrar')).toBeInTheDocument();
    second.unmount();
    renderCard({}, { unpaidCount: 0 });
    expect(screen.getByText('Todo cobrado')).toBeInTheDocument();
  });

  it('sin datos de ventas (admin o cargando) no muestra el estado de cobro', () => {
    renderCard({}, { unpaidCount: null });
    expect(screen.queryByText(/sin cobrar|Todo cobrado/)).not.toBeInTheDocument();
  });

  it('con showOwner muestra de quién es el remate; sin él, no', () => {
    const { unmount } = renderCard({}, { showOwner: true });
    expect(screen.getByText(/Ana Rematadora/)).toBeInTheDocument();
    unmount();
    renderCard({}, { showOwner: false });
    expect(screen.queryByText(/Ana Rematadora/)).not.toBeInTheDocument();
  });

  it('la portada y "Ver resumen" llevan al resumen del remate', () => {
    renderCard();
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/remates/remate-1/historial'));
    expect(within(document.body).getByRole('link', { name: 'Ver resumen' })).toBeInTheDocument();
  });

  it('usa la portada del remate si se la pasan', () => {
    const { container } = renderCard({}, { coverImageUrl: 'cover.jpg' });
    expect(container.querySelector('img')).toHaveAttribute('src', 'cover.jpg');
  });
});
