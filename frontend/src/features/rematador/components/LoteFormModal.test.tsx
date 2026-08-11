import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteFormModal } from './LoteFormModal';
import type { Lote } from '../../remates/types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: {
    createLoteRequest: vi.fn(),
    updateLoteRequest: vi.fn(),
    updateLoteImagesRequest: vi.fn(),
    uploadLoteImageRequest: vi.fn(),
  },
  toastPushMock: vi.fn(),
}));

vi.mock('../../remates/api', () => apiMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Lote de prueba',
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
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeFile(name: string, type: string): File {
  return new File(['contenido'], name, { type });
}

async function fillMinimumValidFields() {
  await userEvent.type(screen.getByLabelText('Número de lote'), '1');
  await userEvent.type(screen.getByLabelText('Nombre'), 'Lote nuevo');
  await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
  await userEvent.type(screen.getByLabelText('Precio inicial'), '1000');
  await userEvent.type(screen.getByLabelText('Incremento mínimo'), '50');
}

describe('LoteFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('en modo creación, muestra campos vacíos', () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Crear lote' })).toBeInTheDocument();
    expect(screen.getByLabelText('Número de lote')).toHaveValue('');
  });

  it('en modo creación, permite elegir imágenes sin necesidad de guardar antes', () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    expect(screen.getByText('Arrastrá imágenes acá o hacé clic para elegirlas')).toBeInTheDocument();
    expect(screen.queryByText('Guardá el lote para poder agregarle imágenes.')).not.toBeInTheDocument();
  });

  it('en modo edición, muestra la galería de imágenes', () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" lote={makeLote()} onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Editar lote' })).toBeInTheDocument();
    expect(screen.getByText('Arrastrá imágenes acá o hacé clic para elegirlas')).toBeInTheDocument();
  });

  it('sin campos requeridos, muestra errores y no llama al backend', async () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(screen.getByText('El número de lote debe tener entre 1 y 20 caracteres.')).toBeInTheDocument();
    expect(apiMocks.createLoteRequest).not.toHaveBeenCalled();
  });

  it('completando los campos requeridos, crea el lote sin imágenes', async () => {
    const created = makeLote({ id: 'lote-nuevo' });
    apiMocks.createLoteRequest.mockResolvedValue(created);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<LoteFormModal isOpen onClose={onClose} remateId="remate-1" onSaved={onSaved} />);
    await fillMinimumValidFields();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lote' }));

    await waitFor(() => expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
      'remate-1',
      expect.objectContaining({ lot_number: '1', base_price: '1000', min_increment: '50' }),
    );
    expect(apiMocks.uploadLoteImageRequest).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no incluye atributos/cantidad/unidad en el payload de creación', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote());
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={vi.fn()} />);
    await fillMinimumValidFields();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lote' }));

    await waitFor(() => expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(1));
    const payload = apiMocks.createLoteRequest.mock.calls[0][1];
    expect(payload.attributes).toBeUndefined();
    expect(payload.quantity).toBeUndefined();
    expect(payload.unit_label).toBeUndefined();
  });

  it('sube las imágenes elegidas recién después de crear el lote, en un único click', async () => {
    const created = makeLote({ id: 'lote-nuevo', images: [] });
    const withImages = makeLote({
      id: 'lote-nuevo',
      images: [{ url: 'https://example.com/nueva.jpg', order: 0, caption: null }],
    });
    apiMocks.createLoteRequest.mockResolvedValue(created);
    apiMocks.uploadLoteImageRequest.mockResolvedValue({ url: 'https://example.com/nueva.jpg' });
    apiMocks.updateLoteImagesRequest.mockResolvedValue(withImages);
    const onSaved = vi.fn();

    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" onSaved={onSaved} />);
    await fillMinimumValidFields();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile('foto.jpg', 'image/jpeg'));

    // Todavía no se subió nada -- el archivo queda en staging local hasta guardar el lote.
    expect(apiMocks.uploadLoteImageRequest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar lote' }));

    await waitFor(() => expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(apiMocks.uploadLoteImageRequest).toHaveBeenCalledWith('remate-1', 'lote-nuevo', expect.any(File)),
    );
    await waitFor(() =>
      expect(apiMocks.updateLoteImagesRequest).toHaveBeenCalledWith('remate-1', 'lote-nuevo', [
        { url: 'https://example.com/nueva.jpg', order: 0, caption: null },
      ]),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(withImages));
  });

  it('en modo edición, no muestra "Guardar y crear otro"', () => {
    render(<LoteFormModal isOpen onClose={vi.fn()} remateId="remate-1" lote={makeLote()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Guardar y crear otro' })).not.toBeInTheDocument();
  });

  it('"Guardar y crear otro" guarda el lote, avisa por toast, limpia el formulario y deja el modal abierto', async () => {
    const created = makeLote({ id: 'lote-nuevo' });
    apiMocks.createLoteRequest.mockResolvedValue(created);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<LoteFormModal isOpen onClose={onClose} remateId="remate-1" onSaved={onSaved} />);
    await fillMinimumValidFields();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y crear otro' }));

    await waitFor(() => expect(apiMocks.createLoteRequest).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(created);
    expect(onClose).not.toHaveBeenCalled();
    expect(toastPushMock).toHaveBeenCalledWith('success', 'Lote creado. Podés cargar el siguiente.');

    await waitFor(() => expect(screen.getByLabelText('Número de lote')).toHaveValue(''));
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Número de lote')).toHaveFocus();
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
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lote' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lote' }));

    await waitFor(() => expect(screen.getByText("Ya existe un lote con el número '1'.")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
