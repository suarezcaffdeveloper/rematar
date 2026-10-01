import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SalaBidPanel, type SalaBidPanelProps } from './SalaBidPanel';
import type { Lote } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';

vi.mock('../api', () => ({ placeBidRequest: vi.fn() }));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: vi.fn() }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'open',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<SalaBidPanelProps> = {}): SalaBidPanelProps {
  return {
    remateId: 'remate-1',
    lote: makeLote(),
    currency: 'ARS',
    winningOffer: null,
    remateStatus: 'live',
    viewerRole: 'comprador',
    isLeadingBidder: false,
    hasRequiredGuarantee: true,
    ...overrides,
  };
}

// `SalaBidPanel` renderiza `PlaceBidButton`, que usa `useNavigate`/`useLocation`
// (visitante anónimo, ADR-049) -- necesita un Router alrededor.
function renderPanel(overrides: Partial<SalaBidPanelProps> = {}) {
  return render(
    <MemoryRouter>
      <SalaBidPanel {...makeProps(overrides)} />
    </MemoryRouter>,
  );
}

describe('SalaBidPanel', () => {
  it('sin ofertas, la "oferta actual" es el precio inicial', () => {
    renderPanel();

    expect(screen.getByText('Precio inicial')).toBeInTheDocument();
    expect(screen.getAllByText(/1[.,]?000/).length).toBeGreaterThanOrEqual(2);
  });

  it('con una oferta ganadora, la "oferta actual" es su monto y marca al comprador como verificado', () => {
    const winningOffer: OfertaSnapshotEntry = {
      id: 'oferta-1',
      buyer_id: null,
      amount: '1500.00',
      status: 'accepted',
      created_at: '2026-07-01T00:00:00Z',
    };

    renderPanel({ winningOffer });

    expect(screen.getByText('Oferta actual · Comprador verificado')).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it('renderiza el formulario de oferta real (PlaceBidButton) -- comprador con lote abierto y remate en vivo lo ve habilitado', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeEnabled();
  });

  it('sin cuenta regresiva (decisión visual confirmada -- el timer ya no se muestra en la Sala)', () => {
    renderPanel({ lote: makeLote({ timer_ends_at: '2026-08-01T00:01:00Z' }) });

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  describe('aviso "Te superaron"', () => {
    const offer = (amount: string): OfertaSnapshotEntry => ({
      id: `o-${amount}`,
      buyer_id: null,
      amount,
      status: 'winning',
      created_at: '2026-07-01T00:00:00Z',
    });

    function rerenderPanel(rerender: (ui: React.ReactElement) => void, overrides: Partial<SalaBidPanelProps>) {
      rerender(
        <MemoryRouter>
          <SalaBidPanel {...makeProps(overrides)} />
        </MemoryRouter>,
      );
    }

    it('si ibas liderando y otra oferta te supera, avisa con el monto que lidera ahora', () => {
      const { rerender } = renderPanel({ isLeadingBidder: true, winningOffer: offer('1500.00') });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      rerenderPanel(rerender, { isLeadingBidder: false, winningOffer: offer('1550.00') });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Te superaron: ahora lidera');
      expect(alert).toHaveTextContent(/1[.,]?550/);
    });

    it('el aviso se puede cerrar', async () => {
      const { rerender } = renderPanel({ isLeadingBidder: true, winningOffer: offer('1500.00') });
      rerenderPanel(rerender, { isLeadingBidder: false, winningOffer: offer('1550.00') });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('desaparece si volvés a liderar', () => {
      const { rerender } = renderPanel({ isLeadingBidder: true, winningOffer: offer('1500.00') });
      rerenderPanel(rerender, { isLeadingBidder: false, winningOffer: offer('1550.00') });
      rerenderPanel(rerender, { isLeadingBidder: true, winningOffer: offer('1600.00') });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('no aparece si nunca lideraste (una oferta ajena más) ni al cambiar de lote', () => {
      const { rerender } = renderPanel({ isLeadingBidder: false, winningOffer: offer('1500.00') });
      rerenderPanel(rerender, { isLeadingBidder: false, winningOffer: offer('1550.00') });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      // Liderando el lote 1 y pasar al lote 2 no es "que te superen".
      const { rerender: rerender2 } = renderPanel({ isLeadingBidder: true, winningOffer: offer('1500.00') });
      rerenderPanel(rerender2, { lote: makeLote({ id: 'lote-2' }), isLeadingBidder: false, winningOffer: null });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
