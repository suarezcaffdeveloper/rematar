import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolaSidebar } from './ConsolaSidebar';
import type { Remate } from '../../remates/types';

vi.mock('../../chat/components/ChatPanel', () => ({
  ChatPanel: () => <div>Chat mock</div>,
}));
vi.mock('../../sala/components/OfferHistoryPanel', () => ({
  OfferHistoryPanel: () => <div>Ofertas mock</div>,
}));
vi.mock('../../moderation/components/ConnectedBuyersList', () => ({
  ConnectedBuyersList: () => <div>Conectados mock</div>,
}));
vi.mock('../../moderation/components/LockChatButton', () => ({
  LockChatButton: () => <button type="button">Bloquear chat</button>,
}));
vi.mock('../../moderation/components/RecentModerationActions', () => ({
  RecentModerationActions: () => <div>Historial de moderación mock</div>,
}));
// Los botones plegables ("Transmisión"/"Martillero") ya tienen su propia cobertura
// (`ConsolaQuickPanels.test.tsx`) -- acá interesa la composición del sidebar (pestañas,
// oferta líder siempre visible), no su contenido interno.
vi.mock('./ConsolaQuickPanels', () => ({
  ConsolaQuickPanels: () => <div>Botones plegables mock</div>,
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: 't',
    updated_at: 't',
    ...overrides,
  } as Remate;
}

function renderSidebar() {
  return render(
    <ConsolaSidebar
      remateId="remate-1"
      subscribeToRealtime={() => () => {}}
      currentUserId="user-1"
      connectedUsers={3}
      winningOffer={null}
      recentOffers={[]}
      currency="ARS"
      remate={makeRemate()}
      isOwner={false}
      onRemateChange={() => {}}
    />,
  );
}

describe('ConsolaSidebar', () => {
  it('por default, muestra la pestaña de Chat', () => {
    renderSidebar();
    expect(screen.getByText('Chat mock')).toBeInTheDocument();
  });

  it('la oferta líder queda siempre visible, fuera de las pestañas', async () => {
    renderSidebar();
    expect(screen.getByText('Ofertas mock')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Ofertas' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Conectados' }));
    expect(screen.getByText('Ofertas mock')).toBeInTheDocument();
  });

  it('cambiar a la pestaña Conectados muestra ConnectedBuyersList', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('tab', { name: 'Conectados' }));
    expect(screen.getByText('Conectados mock')).toBeInTheDocument();
  });

  it('cambiar a la pestaña Moderación muestra el historial y el botón de bloquear chat', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('tab', { name: 'Moderación' }));
    expect(screen.getByText('Historial de moderación mock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloquear chat' })).toBeInTheDocument();
  });
});
