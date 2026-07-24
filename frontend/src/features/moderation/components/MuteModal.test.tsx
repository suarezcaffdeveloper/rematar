import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MuteModal } from './MuteModal';

const apiMocks = vi.hoisted(() => ({
  muteBuyerRequest: vi.fn(),
}));
vi.mock('../api', () => apiMocks);

describe('MuteModal', () => {
  it('confirma con la duración por defecto (5 minutos)', async () => {
    apiMocks.muteBuyerRequest.mockResolvedValue(undefined);
    const onMuted = vi.fn();
    const user = userEvent.setup();

    render(
      <MuteModal
        isOpen
        onClose={vi.fn()}
        remateId="remate-1"
        buyerId="buyer-1"
        buyerName="Juan"
        onMuted={onMuted}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Silenciar' }));

    expect(apiMocks.muteBuyerRequest).toHaveBeenCalledWith('remate-1', 'buyer-1', 300);
    expect(onMuted).toHaveBeenCalled();
  });

  it('permite elegir otra duración antes de confirmar', async () => {
    apiMocks.muteBuyerRequest.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MuteModal
        isOpen
        onClose={vi.fn()}
        remateId="remate-1"
        buyerId="buyer-1"
        buyerName="Juan"
        onMuted={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Duración'), '3600');
    await user.click(screen.getByRole('button', { name: 'Silenciar' }));

    expect(apiMocks.muteBuyerRequest).toHaveBeenCalledWith('remate-1', 'buyer-1', 3600);
  });
});
