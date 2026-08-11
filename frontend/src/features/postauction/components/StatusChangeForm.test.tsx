import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusChangeForm } from './StatusChangeForm';

const apiMocks = vi.hoisted(() => ({
  changeVentaEstadoRequest: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StatusChangeForm', () => {
  it('ofrece únicamente los estados posteriores al actual', () => {
    render(<StatusChangeForm caseId="case-1" currentStatus="pago_recibido" onChanged={vi.fn()} />);

    const select = screen.getByLabelText('Nuevo estado') as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toEqual(['preparando_entrega', 'enviado', 'entregado', 'finalizado']);
  });

  it('muestra un aviso de cierre cuando ya está en el último estado', () => {
    render(<StatusChangeForm caseId="case-1" currentStatus="finalizado" onChanged={vi.fn()} />);
    expect(screen.getByText(/último estado del flujo/)).toBeInTheDocument();
  });

  it('envía el nuevo estado y llama onChanged', async () => {
    apiMocks.changeVentaEstadoRequest.mockResolvedValue({});
    const onChanged = vi.fn();
    const user = userEvent.setup();

    render(<StatusChangeForm caseId="case-1" currentStatus="adjudicado" onChanged={onChanged} />);

    await user.selectOptions(screen.getByLabelText('Nuevo estado'), 'pago_pendiente');
    await user.click(screen.getByRole('button', { name: 'Cambiar estado' }));

    expect(apiMocks.changeVentaEstadoRequest).toHaveBeenCalledWith('case-1', {
      new_status: 'pago_pendiente',
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('muestra el error del backend si la transición es rechazada', async () => {
    apiMocks.changeVentaEstadoRequest.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: { error: { code: 'business_rule_violation', message: "No se puede pasar de 'finalizado' a 'pago_pendiente'." } },
      },
    });
    const user = userEvent.setup();

    render(<StatusChangeForm caseId="case-1" currentStatus="adjudicado" onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Cambiar estado' }));

    expect(await screen.findByText(/No se puede pasar de/)).toBeInTheDocument();
  });
});
