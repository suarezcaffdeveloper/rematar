import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    documents: [],
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
    expect(screen.getByText('Todavía no hay observaciones.')).toBeInTheDocument();
    expect(screen.getByText('Sin actividad registrada')).toBeInTheDocument();
  });

  it('muestra el recorrido de los 8 estados con el próximo paso en el estado actual', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    const journey = (await screen.findByRole('heading', { name: 'El recorrido de la venta' })).closest('section') as HTMLElement;
    expect(within(journey).getAllByRole('listitem')).toHaveLength(8);
    expect(within(journey).getByRole('listitem', { current: 'step' })).toHaveTextContent('Pago pendiente');
    expect(within(journey).getByRole('button', { name: /Registrar pago recibido/ })).toBeInTheDocument();
    // Los estados que faltan permiten saltar directo; los anteriores no.
    expect(within(journey).getAllByRole('button', { name: 'Pasar directo a este estado' })).toHaveLength(5);
  });

  it('pasar directo a un estado avisa qué pasos se saltean antes de confirmar', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    const journey = (await screen.findByRole('heading', { name: 'El recorrido de la venta' })).closest('section') as HTMLElement;
    await userEvent.click(within(journey).getAllByRole('button', { name: 'Pasar directo a este estado' })[2]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Vas a saltear 2 pasos/)).toBeInTheDocument();
  });

  it('marca como salteado el paso que no tiene fecha y muestra la actividad con lo más reciente primero', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(makeDetail({ status: 'enviado' }));
    renderPage();

    expect((await screen.findAllByText('Salteado: este paso quedó sin fecha.')).length).toBeGreaterThan(0);
    const activity = screen.getByRole('heading', { name: 'Actividad' }).closest('section') as HTMLElement;
    const badges = within(activity).getAllByText(/Observación agregada|Caso creado/);
    expect(badges[0]).toHaveTextContent('Observación agregada');
  });

  it('avisa que el comprador ve las observaciones', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    expect(await screen.findByText(/El comprador ve las observaciones/)).toBeInTheDocument();
  });

  it('muestra un error con opción de reintentar si falla la carga', async () => {
    apiMocks.fetchVentaDetailRequest.mockRejectedValue(new Error('network error'));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
