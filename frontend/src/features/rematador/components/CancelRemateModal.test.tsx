import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelRemateModal } from './CancelRemateModal';
import type { Remate } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({ cancelRemateRequest: vi.fn() }));
vi.mock('../../remates/api', () => apiMocks);

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
    status: 'scheduled',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('CancelRemateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('el botón de confirmar arranca deshabilitado sin motivo', () => {
    render(<CancelRemateModal isOpen onClose={vi.fn()} remate={makeRemate()} onCancelled={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancelar remate' })).toBeDisabled();
  });

  it('con un motivo válido, confirma y llama a cancelRemateRequest', async () => {
    const cancelled = makeRemate({ status: 'cancelled', cancellation_reason: 'Fuerza mayor' });
    apiMocks.cancelRemateRequest.mockResolvedValue(cancelled);
    const onCancelled = vi.fn();
    const onClose = vi.fn();

    render(<CancelRemateModal isOpen onClose={onClose} remate={makeRemate()} onCancelled={onCancelled} />);
    await userEvent.type(screen.getByLabelText('Motivo de la cancelación'), 'Fuerza mayor');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar remate' }));

    await waitFor(() => expect(apiMocks.cancelRemateRequest).toHaveBeenCalledWith('remate-1', 'Fuerza mayor'));
    expect(onCancelled).toHaveBeenCalledWith(cancelled);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('con un motivo demasiado corto, muestra el error y no llama al backend', async () => {
    render(<CancelRemateModal isOpen onClose={vi.fn()} remate={makeRemate()} onCancelled={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Motivo de la cancelación'), 'ab');

    expect(screen.getByRole('button', { name: 'Cancelar remate' })).toBeDisabled();
    expect(apiMocks.cancelRemateRequest).not.toHaveBeenCalled();
  });

  it('"Volver" cierra sin cancelar', async () => {
    const onClose = vi.fn();
    render(<CancelRemateModal isOpen onClose={onClose} remate={makeRemate()} onCancelled={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiMocks.cancelRemateRequest).not.toHaveBeenCalled();
  });

  it('ante un error del backend, lo muestra sin cerrar el modal', async () => {
    apiMocks.cancelRemateRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'No se puede cancelar.' } } },
    });
    const onClose = vi.fn();

    render(<CancelRemateModal isOpen onClose={onClose} remate={makeRemate()} onCancelled={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Motivo de la cancelación'), 'Motivo válido');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar remate' }));

    await waitFor(() => expect(screen.getByText('No se puede cancelar.')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
