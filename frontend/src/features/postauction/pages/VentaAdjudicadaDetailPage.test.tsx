import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VentaAdjudicadaDetailPage } from './VentaAdjudicadaDetailPage';
import type { PostAuctionCaseDetail } from '../types';

const apiMocks = vi.hoisted(() => ({
  fetchVentaDetailRequest: vi.fn(),
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
    buyer_email: 'marcos@example.com',
    buyer_phone: '+5491111111111',
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
    <MemoryRouter initialEntries={['/ventas-adjudicadas/case-1']}>
      <Routes>
        <Route path="/ventas-adjudicadas/:caseId" element={<VentaAdjudicadaDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VentaAdjudicadaDetailPage', () => {
  it('muestra precio inicial, precio final, estado y contacto del comprador', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    expect((await screen.findAllByText('Ford Ranger XLT 3.2 4x2')).length).toBeGreaterThan(0);
    expect(screen.getByText(/\$\s?10\.000\.000/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s?15\.000\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pago pendiente').length).toBeGreaterThan(0);
    expect(screen.getByText('marcos@example.com')).toBeInTheDocument();
    expect(screen.getByText('+5491111111111')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enviar email/ })).toHaveAttribute(
      'href',
      'mailto:marcos@example.com',
    );
    expect(screen.getByRole('link', { name: /Contactar por WhatsApp/ })).toHaveAttribute(
      'href',
      'https://wa.me/5491111111111',
    );
  });

  it('no rompe cuando no hay observación ni actividad', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(
      makeDetail({ notes: null, timeline: [] }),
    );
    renderPage();

    expect((await screen.findAllByText('Ford Ranger XLT 3.2 4x2')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Última observación')).not.toBeInTheDocument();
    expect(screen.getByText('Sin actividad registrada')).toBeInTheDocument();
  });

  it('muestra un error con opción de reintentar si falla la carga', async () => {
    apiMocks.fetchVentaDetailRequest.mockRejectedValue(new Error('network error'));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
