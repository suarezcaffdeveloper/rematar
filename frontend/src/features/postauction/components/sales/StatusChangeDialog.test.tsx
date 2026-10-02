import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusChangeDialog } from './StatusChangeDialog';
import type { PostAuctionStatus } from '../../types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: { changeVentaEstadoRequest: vi.fn() },
  toastPushMock: vi.fn(),
}));

vi.mock('../../api', () => apiMocks);
vi.mock('../../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function renderDialog(from: PostAuctionStatus, to: PostAuctionStatus) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <StatusChangeDialog isOpen onClose={onClose} caseId="case-1" loteTitle="Novillos Angus" buyerName="Estancia La Margarita" from={from} to={to} onChanged={onChanged} />,
  );
  return { onClose, onChanged };
}

describe('StatusChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('para el próximo paso usa el nombre de la acción y avisa que no se puede volver atrás', () => {
    renderDialog('pago_pendiente', 'pago_recibido');

    expect(screen.getByRole('dialog', { name: 'Registrar pago recibido' })).toBeInTheDocument();
    expect(screen.getByText(/no se puede volver atrás/)).toBeInTheDocument();
    expect(screen.queryByText(/Vas a saltear/)).not.toBeInTheDocument();
  });

  it('un salto avisa qué pasos se saltean y que quedan sin fecha', () => {
    renderDialog('pago_pendiente', 'enviado');

    expect(screen.getByText(/Vas a saltear 2 pasos:/)).toBeInTheDocument();
    expect(screen.getByText(/Pago recibido, Preparando entrega/)).toBeInTheDocument();
    expect(screen.getByText(/quedan sin fecha/)).toBeInTheDocument();
  });

  it('avisa que el comprador ve la observación y recibe una notificación con su título', () => {
    renderDialog('pago_pendiente', 'pago_recibido');
    expect(screen.getByText('“Pago registrado”')).toBeInTheDocument();
    expect(screen.getByText(/El comprador ve esta observación/)).toBeInTheDocument();
  });

  it('confirmar manda solo el estado nuevo si no se escribió nota ni se tocó la fecha', async () => {
    apiMocks.changeVentaEstadoRequest.mockResolvedValue({});
    const { onClose, onChanged } = renderDialog('adjudicado', 'pendiente_contacto');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() => expect(apiMocks.changeVentaEstadoRequest).toHaveBeenCalledWith('case-1', { new_status: 'pendiente_contacto', note: undefined, occurred_at: undefined }));
    expect(toastPushMock).toHaveBeenCalledWith('success', 'Estado actualizado a “Pendiente de contacto”.');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('manda la observación y la fecha cuando la empresa las completa', async () => {
    apiMocks.changeVentaEstadoRequest.mockResolvedValue({});
    renderDialog('pago_pendiente', 'pago_recibido');

    await userEvent.type(screen.getByLabelText(/Observación/), '  Transfirió por Banco Nación  ');
    const when = screen.getByLabelText('¿Cuándo ocurrió?');
    await userEvent.clear(when);
    await userEvent.type(when, '2026-09-28T10:30');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() => expect(apiMocks.changeVentaEstadoRequest).toHaveBeenCalled());
    const body = apiMocks.changeVentaEstadoRequest.mock.calls[0][1];
    expect(body.note).toBe('Transfirió por Banco Nación');
    expect(body.new_status).toBe('pago_recibido');
    expect(new Date(body.occurred_at).getTime()).toBe(new Date('2026-09-28T10:30').getTime());
  });

  it('un error del backend se muestra dentro del diálogo y no lo cierra', async () => {
    apiMocks.changeVentaEstadoRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: "No se puede pasar de 'X' a 'Y'." } } },
    });
    const { onClose, onChanged } = renderDialog('adjudicado', 'pendiente_contacto');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    expect(await screen.findByText("No se puede pasar de 'X' a 'Y'.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
