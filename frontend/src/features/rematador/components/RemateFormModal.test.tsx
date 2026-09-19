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
    settings: {
      anti_sniping_enabled: false,
      anti_sniping_extension_seconds: 60,
      currency: 'ARS',
      lote_timer_seconds: null,
      timed_extension_window_seconds: null,
      timed_extension_duration_seconds: null,
    },
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

  it('en modo creación, muestra el título "Crear nuevo remate" con campos vacíos', () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Crear nuevo remate' })).toBeInTheDocument();
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

  it('en vivo no muestra anti-sniping ni cuenta regresiva por lote', () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText('Habilitar anti-sniping')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Habilitar cuenta regresiva por lote')).not.toBeInTheDocument();
  });

  it('la garantía aparece una sola vez, en ambas modalidades', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getAllByLabelText('Exigir garantía económica para ofertar')).toHaveLength(1);
    await userEvent.click(screen.getByText('Timed Auction'));
    expect(screen.getAllByLabelText('Exigir garantía económica para ofertar')).toHaveLength(1);
  });

  it('garantía deshabilitada por default, no muestra el campo de monto', () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/Monto de la garantía/)).not.toBeInTheDocument();
  });

  it('habilitar la garantía muestra el campo de monto y lo manda en el payload', async () => {
    apiMocks.createRemateRequest.mockResolvedValue(makeRemate());
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Título'), 'Remate de prueba');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.click(screen.getByLabelText('Exigir garantía económica para ofertar'));
    const amountInput = screen.getByLabelText(/Monto de la garantía/);
    await userEvent.type(amountInput, '50000');
    await userEvent.click(screen.getByRole('button', { name: 'Crear remate' }));

    await waitFor(() => expect(apiMocks.createRemateRequest).toHaveBeenCalledTimes(1));
    const settings = apiMocks.createRemateRequest.mock.calls[0][0].settings;
    expect(settings.guarantee_required).toBe(true);
    expect(settings.guarantee_amount).toBe('50000');
  });

  it('garantía habilitada sin monto, muestra error de validación y no llama al backend', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Remate de prueba');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.click(screen.getByLabelText('Exigir garantía económica para ofertar'));
    await userEvent.click(screen.getByRole('button', { name: 'Crear remate' }));

    expect(screen.getByText('Ingresá un monto de garantía mayor a cero.')).toBeInTheDocument();
    expect(apiMocks.createRemateRequest).not.toHaveBeenCalled();
  });

  it('en modo creación, elegir Timed muestra fecha de fin obligatoria y oculta la cuenta regresiva por lote', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.queryByLabelText('Fecha y hora de finalización')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Timed Auction'));

    expect(screen.getByLabelText('Fecha y hora de finalización')).toBeInTheDocument();
    expect(screen.queryByLabelText('Habilitar cuenta regresiva por lote')).not.toBeInTheDocument();
  });

  it('timed: habilitar anti-sniping muestra ventana y duración por separado', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByText('Timed Auction'));
    await userEvent.click(screen.getByLabelText('Habilitar anti-sniping'));

    expect(screen.getByLabelText(/Ventana de extensión/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Duración de la extensión/)).toBeInTheDocument();
  });

  it('timed: sin fecha de fin, muestra error de validación y no llama al backend', async () => {
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Remate timed');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'hacienda');
    await userEvent.click(screen.getByText('Timed Auction'));
    await userEvent.click(screen.getByRole('button', { name: 'Crear remate' }));

    expect(screen.getByText('Un remate Timed necesita fecha y hora de finalización.')).toBeInTheDocument();
    expect(apiMocks.createRemateRequest).not.toHaveBeenCalled();
  });

  it('en modo edición de un remate Timed, no muestra el selector de modalidad pero sí sus campos', () => {
    const remate = makeRemate({
      auction_type: 'timed',
      starts_at: '2026-08-01T14:00:00Z',
      ends_at: '2026-08-08T14:00:00Z',
    });
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} remate={remate} />);

    expect(screen.queryByText('Timed Auction')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fecha y hora de finalización')).toBeInTheDocument();
  });

  it('en modo edición de un remate en vivo viejo con cuenta regresiva, no la muestra', () => {
    const remate = makeRemate({
      settings: {
        anti_sniping_enabled: true,
        anti_sniping_extension_seconds: 60,
        currency: 'ARS',
        lote_timer_seconds: 45,
        timed_extension_window_seconds: null,
        timed_extension_duration_seconds: null,
      },
    });
    render(<RemateFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} remate={remate} />);

    expect(screen.queryByLabelText('Habilitar cuenta regresiva por lote')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Habilitar anti-sniping')).not.toBeInTheDocument();
  });
});
