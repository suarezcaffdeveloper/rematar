import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemateFormModal } from './RemateFormModal';
import type { Remate } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({
  createRemateRequest: vi.fn(),
  updateRemateRequest: vi.fn(),
}));

vi.mock('../../remates/api', () => apiMocks);

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate existente',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'draft',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('RemateFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('en modo creación, muestra el título "Crear remate" con campos vacíos', () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Crear remate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });

  it('en modo edición, precarga los valores del remate', () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} remate={makeRemate()} />);
    expect(screen.getByRole('heading', { name: 'Editar remate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Remate existente');
  });

  it('sin título ni categoría, muestra errores de validación y no llama al backend', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Crear remate' }));

    expect(screen.getByText('El título debe tener entre 3 y 200 caracteres.')).toBeInTheDocument();
    expect(apiMocks.createRemateRequest).not.toHaveBeenCalled();
  });

  it('completando los campos requeridos, crea el remate y llama a onSaved/onClose', async () => {
    const created = makeRemate({ id: 'remate-nuevo' });
    apiMocks.createRemateRequest.mockResolvedValue(created);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<RemateFormModal isOpen onClose={onClose} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Remate de prueba');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.click(screen.getByRole('button', { name: 'Crear remate' }));

    await waitFor(() => expect(apiMocks.createRemateRequest).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('en modo edición, guarda con updateRemateRequest usando el id del remate', async () => {
    apiMocks.updateRemateRequest.mockResolvedValue(makeRemate());
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} remate={makeRemate()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(apiMocks.updateRemateRequest).toHaveBeenCalledWith('remate-1', expect.any(Object)));
  });

  it('ante un error del backend, lo muestra sin cerrar el modal', async () => {
    apiMocks.createRemateRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo crear.' } } },
    });
    const onClose = vi.fn();

    render(<RemateFormModal isOpen onClose={onClose} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Remate de prueba');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.click(screen.getByRole('button', { name: 'Crear remate' }));

    await waitFor(() => expect(screen.getByText('No se pudo crear.')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('anti-sniping deshabilitado por default, no muestra el campo de segundos', () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/Segundos de extensión/)).not.toBeInTheDocument();
  });

  it('habilitar anti-sniping muestra el campo de segundos', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByLabelText('Habilitar anti-sniping'));
    expect(screen.getByLabelText(/Segundos de extensión/)).toBeInTheDocument();
  });
});
