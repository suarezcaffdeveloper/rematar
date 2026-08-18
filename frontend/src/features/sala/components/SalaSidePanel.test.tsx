import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalaSidePanel } from './SalaSidePanel';
import type { OfertaSnapshotEntry } from '../types';

// El chat real (`useChatMessages`, moderación, etc.) ya tiene su propia cobertura en
// `ChatPanel.test.tsx` -- acá interesa solo la composición (pestañas + qué se ve),
// no re-probar el chat por dentro.
vi.mock('../../chat/components/ChatPanel', () => ({
  ChatPanel: () => <div>Chat mock del remate</div>,
}));

function makeOffer(overrides: Partial<OfertaSnapshotEntry> = {}): OfertaSnapshotEntry {
  return {
    id: 'oferta-1',
    buyer_id: null,
    amount: '1200.00',
    status: 'accepted',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderPanel(recentOffers: OfertaSnapshotEntry[] = []) {
  return render(
    <SalaSidePanel
      recentOffers={recentOffers}
      currency="ARS"
      remateId="remate-1"
      subscribeToRealtime={() => () => {}}
      currentUserId="user-1"
      connectedUsers={3}
    />,
  );
}

describe('SalaSidePanel', () => {
  it('arranca en la pestaña "Chat"', () => {
    renderPanel([makeOffer()]);

    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Historial de ofertas' })).toHaveAttribute('aria-selected', 'false');
  });

  it('el chat queda montado desde el arranque -- no se remonta al cambiar de pestaña', () => {
    renderPanel();

    expect(screen.getByText('Chat mock del remate')).toBeInTheDocument();
  });

  it('cambiar a la pestaña "Historial de ofertas" la marca como activa', async () => {
    renderPanel([makeOffer()]);

    await userEvent.click(screen.getByRole('tab', { name: 'Historial de ofertas' }));

    expect(screen.getByRole('tab', { name: 'Historial de ofertas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'false');
  });

  it('sin ofertas, el historial muestra el mensaje vacío', () => {
    renderPanel([]);

    expect(screen.getByText('Sin ofertas todavía.')).toBeInTheDocument();
  });
});
