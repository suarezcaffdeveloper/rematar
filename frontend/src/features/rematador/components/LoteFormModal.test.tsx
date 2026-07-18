import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteFormModal } from './LoteFormModal';
import type { Lote } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({
  createLoteRequest: vi.fn(),
  updateLoteRequest: vi.fn(),
}));

vi.mock('../../remates/api', () => apiMocks);

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: 'Descripción',
    category: 'hacienda',
    attributes: { peso_kg: 480, raza: 'Angus' },
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

async function fillMinimumValidFields(withLote = false) {
  if (!withLote) {
    await userEvent.type(screen.getByLabelText('Número de lote'), '1');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Toro Hereford');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.type(screen.getByLabelText('Precio inicial'), '1000');
    await userEvent.type(screen.getByLabelText('Incremento mínimo'), '50');
  }
}

describe('LoteFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('en modo creación, muestra campos vacíos', () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Crear lote' })).toBeInTheDocument();
    expect(screen.getByLabelText('Número de lote')).toHaveValue('');
  });

  it('en modo edición, separa peso_kg de los demás atributos', () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" lote={makeLote()} onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Editar lote' })).toBeInTheDocument();
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue(480);
    expect(screen.getByLabelText('Clave del atributo 1')).toHaveValue('raza');
    expect(screen.getByLabelText('Valor del atributo 1')).toHaveValue('Angus');
  });

  it('sin campos requeridos, muestra errores y no llama al backend', async () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Crear lote' }));

    expect(screen.getByText('El número de lote debe tener entre 1 y 20 caracteres.')).toBeInTheDocument();
    expect(apiMocks.createLoteRequest).not.toHaveBeenCalled();
  });

  it('completando los campos requeridos, crea el lote', async () => {
    const created = makeLote({ id: 'lote-nuevo' });
    apiMocks.createLoteRequest.mockResolvedValue(created);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<LoteFormModal isOpen onClose={onClose} remateId="remate-1" onSaved={onSaved} />);
    await fillMinimumValidFields();
    await userEvent.click(screen.getByRole('button', { name: 'Crear lote' }));

    await waitFor(() => expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
      'remate-1',
      expect.objectContaining({ lot_number: '1', base_price: '1000', min_increment: '50' }),
    );
    expect(onSaved).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('agregar un atributo y completarlo lo incluye en el payload', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    await fillMinimumValidFields();

    await userEvent.click(screen.getByRole('button', { name: 'Agregar atributo' }));
    await userEvent.type(screen.getByLabelText('Clave del atributo 1'), 'raza');
    await userEvent.type(screen.getByLabelText('Valor del atributo 1'), 'Hereford');
    await userEvent.click(screen.getByRole('button', { name: 'Crear lote' }));

    await waitFor(() =>
      expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
        'remate-1',
        expect.objectContaining({ attributes: { raza: 'Hereford' } }),
      ),
    );
  });

  it('quitar un atributo lo excluye del formulario', async () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" lote={makeLote()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText('Clave del atributo 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar atributo 1' }));
    expect(screen.queryByLabelText('Clave del atributo 1')).not.toBeInTheDocument();
  });

  it('en modo edición, guarda con updateLoteRequest', async () => {
    apiMocks.updateLoteRequest.mockResolvedValue(makeLote());
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" lote={makeLote()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(apiMocks.updateLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', expect.any(Object)),
    );
  });

  it('precio de reserva menor al inicial, muestra error y no llama al backend', async () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    await fillMinimumValidFields();
    await userEvent.type(screen.getByLabelText('Precio de reserva (opcional)'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Crear lote' }));

    expect(screen.getByText('El precio de reserva no puede ser menor al precio inicial.')).toBeInTheDocument();
    expect(apiMocks.createLoteRequest).not.toHaveBeenCalled();
  });

  it('ante un error del backend (por ejemplo, número de lote duplicado), lo muestra sin cerrar', async () => {
    apiMocks.createLoteRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'conflict', message: "Ya existe un lote con el número '1'." } } },
    });
    const onClose = vi.fn();

    render(<LoteFormModal isOpen onClose={onClose} remateId="remate-1" onSaved={vi.fn()} />);
    await fillMinimumValidFields();
    await userEvent.click(screen.getByRole('button', { name: 'Crear lote' }));

    await waitFor(() => expect(screen.getByText("Ya existe un lote con el número '1'.")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
