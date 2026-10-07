import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lote } from '../../../remates/types';
import { LotesTab } from './LotesTab';

const useRemateLotesMock = vi.hoisted(() => vi.fn());
vi.mock('./useRemateLotes', () => ({ useRemateLotes: useRemateLotesMock }));
vi.mock('../../../history/hooks', () => ({ useLoteResultsForRemate: () => ({ data: new Map() }) }));
vi.mock('../../../history/components/LoteHistoryDrawer', () => ({ LoteHistoryDrawer: () => null }));
vi.mock('../ConsolaDesiertoLotesPanel', () => ({ DesiertoLoteCard: ({ lote }: { lote: Lote }) => <div>desierto {lote.title}</div> }));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'l1', remate_id: 'r1', lot_number: '1', display_order: 0, title: 'Vaquillona', description: null,
    category: 'hacienda', attributes: {}, images: [], quantity: 1, unit_label: null, base_price: '1000.00',
    min_increment: '50.00', reserve_price: null, final_price: null, status: 'pending', timer_ends_at: null,
    timer_paused_remaining_seconds: null, timer_auto_close_enabled: true, round_number: 1,
    created_at: '2026-07-01T00:00:00Z', ...overrides,
  };
}

function setup(desiertos: Lote[] = []) {
  useRemateLotesMock.mockReturnValue({
    lotes: [makeLote({ id: 's1', lot_number: '3', title: 'Toro', status: 'closed_sold', final_price: '1500.00' })],
    isLoading: false, error: null, total: 1, reload: vi.fn(),
  });
  render(
    <LotesTab remateId="r1" closedSold={1} upcomingLotes={[makeLote({ id: 'u1', lot_number: '2', title: 'Novillo' })]} desiertoLotes={desiertos} currency="ARS" />,
  );
}

describe('LotesTab', () => {
  it('ordena desiertos, próximos y adjudicados', () => {
    setup([makeLote({ id: 'd1', title: 'Ternero', status: 'closed_unsold' })]);
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles[0]).toMatch(/Desiertos/);
    expect(titles[1]).toMatch(/Próximos/);
    expect(titles[2]).toMatch(/Adjudicados/);
    expect(screen.getByText(/Lote 3 · Toro/)).toBeInTheDocument();
  });

  it('cada apartado se pliega y se despliega', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /Próximos/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('sin desiertos, el apartado arranca plegado con su aviso', () => {
    setup();
    expect(screen.getByRole('button', { name: /Desiertos/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
