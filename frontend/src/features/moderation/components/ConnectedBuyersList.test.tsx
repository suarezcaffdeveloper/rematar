import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectedBuyersList } from './ConnectedBuyersList';
import type { ConnectedBuyer } from '../types';

const useConnectedBuyersMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useConnectedBuyers: useConnectedBuyersMock }));

function makeBuyer(overrides: Partial<ConnectedBuyer> = {}): ConnectedBuyer {
  return {
    user_id: 'buyer-1',
    full_name: 'Juan Comprador',
    connected_at: '2026-07-23T10:00:00Z',
    is_muted: false,
    ...overrides,
  };
}

function renderList(buyers: ConnectedBuyer[] = [makeBuyer()], reloadToken = 0) {
  useConnectedBuyersMock.mockReturnValue({
    data: buyers,
    isLoading: false,
    error: null,
    reload: vi.fn(),
  });
  return render(<ConnectedBuyersList remateId="remate-1" reloadToken={reloadToken} />);
}

describe('ConnectedBuyersList', () => {
  it('muestra los compradores conectados con su nombre', () => {
    renderList();
    expect(screen.getByText('Juan Comprador')).toBeInTheDocument();
  });

  it('un comprador silenciado muestra el badge correspondiente', () => {
    renderList([makeBuyer({ is_muted: true })]);
    expect(screen.getByText('Silenciado')).toBeInTheDocument();
  });

  it('sin conectados, muestra el mensaje vacío', () => {
    renderList([]);
    expect(screen.getByText('Ningún comprador coincide.')).toBeInTheDocument();
  });

  it('el botón Expulsar abre el modal de expulsión', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Expulsar' }));
    expect(screen.getByRole('heading', { name: 'Expulsar a Juan Comprador' })).toBeInTheDocument();
  });

  it('el botón Silenciar abre el modal de silenciamiento', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Silenciar' }));
    expect(screen.getByRole('heading', { name: 'Silenciar a Juan Comprador' })).toBeInTheDocument();
  });
});
