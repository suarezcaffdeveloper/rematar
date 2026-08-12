import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotProfileFormModal } from './BotProfileFormModal';
import type { BotProfile } from '../types';

const apiMocks = vi.hoisted(() => ({
  createBotProfileRequest: vi.fn(),
  updateBotProfileRequest: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

function makeBot(overrides: Partial<BotProfile> = {}): BotProfile {
  return {
    id: 'bot-1',
    user_id: 'user-bot-1',
    display_name: 'Bot Existente',
    personality: 'aggressive',
    max_budget: '8000.00',
    reaction_delay_min_seconds: 3,
    reaction_delay_max_seconds: 7,
    continue_probability: '0.90',
    participates_in_chat: true,
    chat_message_frequency: '0.50',
    is_active: true,
    ...overrides,
  };
}

async function fillMinimumValidFields() {
  await userEvent.type(screen.getByLabelText('Nombre visible'), 'Bot Nuevo');
  await userEvent.type(screen.getByLabelText('Presupuesto máximo'), '5000');
}

describe('BotProfileFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('en modo creación, muestra campos vacíos con valores por defecto razonables', () => {
    render(<BotProfileFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Crear simulador' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('');
    expect(screen.queryByLabelText('Simulador activo')).not.toBeInTheDocument();
  });

  it('en modo edición, precarga los valores del bot existente', () => {
    render(<BotProfileFormModal isOpen onClose={vi.fn()} bot={makeBot()} onSaved={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Editar simulador' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Bot Existente');
    expect(screen.getByLabelText('Presupuesto máximo')).toHaveValue(8000);
    expect(screen.getByLabelText('Simulador activo')).toBeInTheDocument();
  });

  it('sin nombre ni presupuesto, muestra errores y no llama al backend', async () => {
    render(<BotProfileFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Crear simulador' }));

    expect(screen.getByText('Ingresá un nombre visible.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá un presupuesto máximo mayor a cero.')).toBeInTheDocument();
    expect(apiMocks.createBotProfileRequest).not.toHaveBeenCalled();
  });

  it('con tiempo de reacción máximo menor al mínimo, muestra error de validación', async () => {
    render(<BotProfileFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillMinimumValidFields();

    const minInput = screen.getByLabelText('Reacción mínima (seg.)');
    const maxInput = screen.getByLabelText('Reacción máxima (seg.)');
    await userEvent.clear(minInput);
    await userEvent.type(minInput, '10');
    await userEvent.clear(maxInput);
    await userEvent.type(maxInput, '5');

    await userEvent.click(screen.getByRole('button', { name: 'Crear simulador' }));

    expect(screen.getByText('Tiene que ser mayor o igual al tiempo mínimo.')).toBeInTheDocument();
    expect(apiMocks.createBotProfileRequest).not.toHaveBeenCalled();
  });

  it('con datos válidos, crea el bot y llama a onSaved/onClose', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    apiMocks.createBotProfileRequest.mockResolvedValue(makeBot({ id: 'bot-nuevo' }));

    render(<BotProfileFormModal isOpen onClose={onClose} onSaved={onSaved} />);
    await fillMinimumValidFields();

    await userEvent.click(screen.getByRole('button', { name: 'Crear simulador' }));

    await waitFor(() => expect(apiMocks.createBotProfileRequest).toHaveBeenCalledTimes(1));
    const payload = apiMocks.createBotProfileRequest.mock.calls[0][0];
    expect(payload.display_name).toBe('Bot Nuevo');
    expect(payload.max_budget).toBe('5000');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'bot-nuevo' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('activar "Participa en el chat" muestra el campo de frecuencia de mensajes', async () => {
    render(<BotProfileFormModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.queryByLabelText(/frecuencia de mensajes/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Participa en el chat' }));
    expect(screen.getByLabelText(/frecuencia de mensajes/i)).toBeInTheDocument();
  });

  it('en edición, envía PATCH con el id del bot', async () => {
    const onSaved = vi.fn();
    apiMocks.updateBotProfileRequest.mockResolvedValue(makeBot({ max_budget: '9999.00' }));

    render(<BotProfileFormModal isOpen onClose={vi.fn()} bot={makeBot()} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(apiMocks.updateBotProfileRequest).toHaveBeenCalledWith('bot-1', expect.any(Object)));
    expect(onSaved).toHaveBeenCalled();
  });
});
