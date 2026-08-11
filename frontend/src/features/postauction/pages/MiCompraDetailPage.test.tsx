import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MiCompraDetailPage } from './MiCompraDetailPage';
import type { PostAuctionCaseDetail } from '../types';

const apiMocks = vi.hoisted(() => ({
  fetchMiCompraDetailRequest: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

function makeDetail(overrides: Partial<PostAuctionCaseDetail> = {}): PostAuctionCaseDetail {
  return {
    id: 'case-1',
    lote_id: 'lote-1',
    lot_number: '3',
    lote_title: 'Ford Ranger XLT 3.2 4x2',
    lote_cover_image_url: null,
    remate_id: 'remate-1',
    remate_title: 'Gran Subasta de Flota Corporativa',
    buyer_id: 'buyer-1',
    buyer_name: 'Marcos Victor Linares',
    rematador_id: 'rematador-1',
    rematador_name: 'Rematador Demo',
    base_price: '10000000.00',
    final_price: '15000000.00',
    status: 'pago_pendiente',
    contacted_at: '2026-07-26T14:39:00Z',
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: 'El comprador ya me quiere pagar esta re loco',
    created_at: '2026-07-26T14:39:00Z',
    updated_at: '2026-07-28T18:39:00Z',
    timeline: [
      {
        id: 'tl-1',
        occurred_at: '2026-07-26T14:39:00Z',
        actor_id: null,
        actor_name: null,
        actor_role: null,
        action: 'case_created',
        previous_status: null,
        new_status: 'adjudicado',
        note: null,
      },
      {
        id: 'tl-2',
        occurred_at: '2026-07-27T10:00:00Z',
        actor_id: null,
        actor_name: null,
        actor_role: null,
        action: 'notification_failed',
        previous_status: null,
        new_status: null,
        note: null,
      },
      {
        id: 'tl-3',
        occurred_at: '2026-07-28T18:39:00Z',
        actor_id: 'rematador-1',
        actor_name: 'Rematador Demo',
        actor_role: 'rematador',
        action: 'note_added',
        previous_status: null,
        new_status: null,
        note: 'El comprador ya me quiere pagar esta re loco',
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mis-compras/case-1']}>
      <Routes>
        <Route path="/mis-compras/:caseId" element={<MiCompraDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MiCompraDetailPage', () => {
  it('muestra el lote, el estado con jerarquía, el precio final y el próximo paso', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    expect((await screen.findAllByText('Ford Ranger XLT 3.2 4x2')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pago pendiente').length).toBeGreaterThan(0);
    expect(screen.getByText('Tu compra está pendiente de pago.')).toBeInTheDocument();
    expect(screen.getByText('Contactá al rematador para coordinar el pago de esta compra.')).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s?15\.000\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rematador Demo').length).toBeGreaterThan(0);
  });

  it('no expone el email ni el teléfono del rematador', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    await screen.findAllByText('Ford Ranger XLT 3.2 4x2');
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('muestra las observaciones del rematador como feed, sin exponer eventos internos', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    expect(await screen.findByText('Observaciones del rematador')).toBeInTheDocument();
    expect(screen.getAllByText(/El comprador ya me quiere pagar esta re loco/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Error al enviar notificación')).not.toBeInTheDocument();
  });

  it('no rompe cuando no hay observación ni actividad', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail({ notes: null, timeline: [] }));
    renderPage();

    expect((await screen.findAllByText('Ford Ranger XLT 3.2 4x2')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Observaciones del rematador')).not.toBeInTheDocument();
    expect(screen.getByText('Sin actividad registrada')).toBeInTheDocument();
  });

  it('muestra un error con opción de reintentar si falla la carga', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockRejectedValue(new Error('network error'));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
