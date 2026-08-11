import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolaSidebar } from './ConsolaSidebar';

vi.mock('../../chat/components/ChatPanel', () => ({
  ChatPanel: () => <div>Chat mock</div>,
}));
vi.mock('./ConsolaOfferPanel', () => ({
  ConsolaOfferPanel: () => <div>Ofertas mock</div>,
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

function renderSidebar() {
  return render(
    <ConsolaSidebar
      remateId="remate-1"
      subscribeToRealtime={() => () => {}}
      currentUserId="user-1"
      connectedUsers={3}
      recentOffers={[]}
      currency="ARS"
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
