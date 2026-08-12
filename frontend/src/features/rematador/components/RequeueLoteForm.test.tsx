import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequeueLoteForm } from './RequeueLoteForm';
import type { Lote } from '../../remates/types';

const { requeueLoteRequestMock, toastPushMock } = vi.hoisted(() => ({
  requeueLoteRequestMock: vi.fn(),
  toastPushMock: vi.fn(),
}));

vi.mock('../../remates/api', () => ({ requeueLoteRequest: requeueLoteRequestMock }));
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '2',
    display_order: 0,
    title: 'Sembradora Apache',
    description: null,
    category: 'maquinaria_agricola',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'closed_unsold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('RequeueLoteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('precarga los campos con las condiciones actuales del lote, sin campo de precio de reserva', () => {
    render(
      <RequeueLoteForm remateId="remate-1" lote={makeLote()} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByLabelText('Precio inicial')).toHaveValue(1000);
    expect(screen.getByLabelText('Incremento mínimo')).toHaveValue(50);
    expect(screen.queryByLabelText(/Precio de reserva/)).not.toBeInTheDocument();
  });

  it('confirmar sin editar nada reincorpora con las mismas condiciones, sin tocar el precio de reserva', async () => {
    requeueLoteRequestMock.mockResolvedValueOnce(makeLote({ status: 'pending' }));
    const onSuccess = vi.fn();
    render(
      <RequeueLoteForm remateId="remate-1" lote={makeLote()} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reincorporación' }));

    await waitFor(() => {
      expect(requeueLoteRequestMock).toHaveBeenCalledWith('remate-1', 'lote-1', {
        base_price: '1000.00',
        min_increment: '50.00',
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(toastPushMock).toHaveBeenCalledWith('success', expect.stringContaining('Lote 2'));
  });

  it('permite editar el precio inicial antes de confirmar', async () => {
    requeueLoteRequestMock.mockResolvedValueOnce(makeLote({ status: 'pending', base_price: '800.00' }));
    render(<RequeueLoteForm remateId="remate-1" lote={makeLote()} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const basePriceInput = screen.getByLabelText('Precio inicial');
    await userEvent.clear(basePriceInput);
    await userEvent.type(basePriceInput, '800');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reincorporación' }));

    await waitFor(() => {
      expect(requeueLoteRequestMock).toHaveBeenCalledWith(
        'remate-1',
        'lote-1',
        expect.objectContaining({ base_price: '800' }),
      );
    });
  });

  it('muestra el error del backend sin cerrar el formulario', async () => {
    requeueLoteRequestMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 422,
        data: { error: { code: 'business_rule', message: 'El precio de reserva no puede ser menor al precio base.' } },
      },
    });
    const onSuccess = vi.fn();
    render(<RequeueLoteForm remateId="remate-1" lote={makeLote()} onSuccess={onSuccess} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reincorporación' }));

    await waitFor(() => {
      expect(screen.getByText('El precio de reserva no puede ser menor al precio base.')).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('"Cancelar" llama a onCancel sin enviar ningún request', async () => {
    const onCancel = vi.fn();
    render(<RequeueLoteForm remateId="remate-1" lote={makeLote()} onSuccess={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
    expect(requeueLoteRequestMock).not.toHaveBeenCalled();
  });
});
