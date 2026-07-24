import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KickModal } from './KickModal';

const apiMocks = vi.hoisted(() => ({
  kickBuyerRequest: vi.fn(),
}));
vi.mock('../api', () => apiMocks);

describe('KickModal', () => {
  it('confirma con el motivo escrito y llama a onKicked', async () => {
    apiMocks.kickBuyerRequest.mockResolvedValue(undefined);
    const onKicked = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <KickModal
        isOpen
        onClose={onClose}
        remateId="remate-1"
        buyerId="buyer-1"
        buyerName="Juan"
        onKicked={onKicked}
      />,
    );

    await user.type(screen.getByLabelText('Motivo (opcional)'), 'Lenguaje inapropiado');
    await user.click(screen.getByRole('button', { name: 'Expulsar' }));

    expect(apiMocks.kickBuyerRequest).toHaveBeenCalledWith(
      'remate-1',
      'buyer-1',
      'Lenguaje inapropiado',
    );
    expect(onKicked).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('muestra el error del backend si la expulsión falla', async () => {
    apiMocks.kickBuyerRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'No autorizado.' } } },
    });
    const user = userEvent.setup();

    render(
      <KickModal
        isOpen
        onClose={vi.fn()}
        remateId="remate-1"
        buyerId="buyer-1"
        buyerName="Juan"
        onKicked={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expulsar' }));

    expect(await screen.findByText('No autorizado.')).toBeInTheDocument();
  });
});
