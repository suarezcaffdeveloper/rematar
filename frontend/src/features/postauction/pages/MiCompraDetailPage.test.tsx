import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { MiCompraDetailPage } from './MiCompraDetailPage';
import type { PostAuctionCaseDetail } from '../types';

const apiMocks = vi.hoisted(() => ({
  fetchMiCompraDetailRequest: vi.fn(),
}));
const { useLoteMock } = vi.hoisted(() => ({ useLoteMock: vi.fn() }));

vi.mock('../api', () => apiMocks);
vi.mock('../../remates/hooks', () => ({ useLote: useLoteMock }));

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
    documents: [],
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
  useLoteMock.mockReturnValue({ lote: null, isLoading: false, error: null, reload: vi.fn() });
});

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isTopNav: false });
  });
});

describe('MiCompraDetailPage', () => {
  it('muestra el lote, el estado, el precio final, el próximo paso y el responsable', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' })).toBeInTheDocument();
    expect(screen.getByText('Tu compra está pendiente de pago.')).toBeInTheDocument();
    expect(screen.getByText(/Contactá al martillero para coordinar el pago de esta compra\./)).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s?15\.000\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Rematador Demo', { selector: 'dd' })).toBeInTheDocument();
  });

  it('si la compra espera el pago, el paso actual avisa "Te toca a vos"', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' });
    const current = screen.getByRole('listitem', { current: 'step' });
    expect(within(current).getByText(/Te toca a vos/)).toBeInTheDocument();
  });

  it('recorre los 8 pasos: los posteriores al actual quedan como pendientes', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' });
    const steps = within(screen.getByRole('list', { name: 'Recorrido de la compra' })).getAllByRole('listitem');
    expect(steps).toHaveLength(8);
    // pago_pendiente es el tercero: quedan cinco por delante.
    expect(screen.getAllByText('Pendiente')).toHaveLength(5);
  });

  it('no expone el email ni el teléfono del rematador', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' });
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('muestra la observación del martillero en el paso donde ocurrió, sin exponer eventos internos', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' });
    expect(screen.getByText('El comprador ya me quiere pagar esta re loco')).toBeInTheDocument();
    expect(screen.getByText(/Rematador Demo, /, { selector: 'figcaption' })).toBeInTheDocument();
    expect(screen.queryByText('Error al enviar notificación')).not.toBeInTheDocument();
  });

  it('muestra las demás acciones del caso (por ejemplo, un documento adjuntado)', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(
      makeDetail({
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
            action: 'document_uploaded',
            previous_status: null,
            new_status: null,
            note: null,
          },
        ],
      }),
    );
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' });
    expect(screen.getByText(/Documento adjuntado/)).toBeInTheDocument();
  });

  it('no rompe cuando no hay observación ni actividad', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail({ notes: null, timeline: [] }));
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' })).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Recorrido de la compra' })).getAllByRole('listitem')).toHaveLength(8);
  });

  it('las fotos del lote salen de useLote y se cambian con las miniaturas', async () => {
    useLoteMock.mockReturnValue({
      lote: {
        category: 'vehiculos',
        description: 'Camioneta en muy buen estado.',
        images: [
          { url: 'https://img.test/b.jpg', order: 1, caption: null },
          { url: 'https://img.test/a.jpg', order: 0, caption: null },
        ],
      },
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    renderPage();

    const main = await screen.findByRole('img', { name: 'Ford Ranger XLT 3.2 4x2' });
    expect(main).toHaveAttribute('src', 'https://img.test/a.jpg');
    expect(screen.getByText('Camioneta en muy buen estado.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver foto 2 de 2' }));
    expect(screen.getByRole('img', { name: 'Ford Ranger XLT 3.2 4x2' })).toHaveAttribute('src', 'https://img.test/b.jpg');
  });

  it('sin fotos del lote, usa la portada del caso y no muestra miniaturas', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(
      makeDetail({ lote_cover_image_url: 'https://img.test/portada.jpg' }),
    );
    renderPage();

    const main = await screen.findByRole('img', { name: 'Ford Ranger XLT 3.2 4x2' });
    expect(main).toHaveAttribute('src', 'https://img.test/portada.jpg');
    expect(screen.queryByRole('group', { name: 'Fotos del lote' })).not.toBeInTheDocument();
  });

  it('tiene un link para volver a Mis compras y le pide a AppLayout la barra superior', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail());
    const { unmount } = renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ford Ranger XLT 3.2 4x2' });
    expect(screen.getByRole('link', { name: 'Mis compras' })).toHaveAttribute('href', '/mis-compras');
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(false);
  });

  it('muestra un error con opción de reintentar si falla la carga', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockRejectedValue(new Error('network error'));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
