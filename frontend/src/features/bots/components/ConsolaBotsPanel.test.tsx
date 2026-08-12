import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ConsolaBotsPanel } from './ConsolaBotsPanel';
import type { BotProfile, BotRosterEntry, BotSimulationRun } from '../types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: {
    startBotSimulationRequest: vi.fn(),
    pauseBotSimulationRequest: vi.fn(),
    stopBotSimulationRequest: vi.fn(),
    setBotSelectionRequest: vi.fn(),
  },
  toastPushMock: vi.fn(),
}));

const hooksMocks = vi.hoisted(() => ({
  useBotProfiles: vi.fn(),
  useBotSimulation: vi.fn(),
}));

vi.mock('../api', () => apiMocks);
vi.mock('../hooks', () => hooksMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeBot(overrides: Partial<BotProfile> = {}): BotProfile {
  return {
    id: 'bot-1',
    user_id: 'user-bot-1',
    display_name: 'Bot Competitivo',
    personality: 'competitive',
    max_budget: '5000.00',
    reaction_delay_min_seconds: 2,
    reaction_delay_max_seconds: 5,
    continue_probability: '0.70',
    participates_in_chat: false,
    chat_message_frequency: '0',
    is_active: true,
    ...overrides,
  };
}

function makeRosterEntry(overrides: Partial<BotRosterEntry> = {}): BotRosterEntry {
  return {
    bot_profile_id: 'bot-1',
    user_id: 'user-bot-1',
    display_name: 'Bot Competitivo',
    is_enabled: true,
    ...overrides,
  };
}

function setupHooks(options: {
  bots?: BotProfile[];
  roster?: BotRosterEntry[];
  run?: BotSimulationRun | null;
  reload?: () => void;
}) {
  hooksMocks.useBotProfiles.mockReturnValue({
    bots: options.bots ?? [makeBot()],
    isLoading: false,
    error: null,
    reload: vi.fn(),
  });
  hooksMocks.useBotSimulation.mockReturnValue({
    roster: options.roster ?? [],
    run: options.run ?? null,
    isLoading: false,
    error: null,
    reload: options.reload ?? vi.fn(),
  });
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <ConsolaBotsPanel remateId="remate-1" />
    </MemoryRouter>,
  );
}

describe('ConsolaBotsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el estado vacío cuando no hay bots activos', () => {
    setupHooks({ bots: [] });

    renderPanel();

    expect(screen.getByText(/todavía no tenés simuladores activos/i)).toBeInTheDocument();
  });

  it('lista los bots activos con su selección actual', () => {
    setupHooks({ bots: [makeBot()], roster: [makeRosterEntry()] });

    renderPanel();

    const checkbox = screen.getByRole('checkbox', { name: /bot competitivo/i });
    expect(checkbox).toBeChecked();
  });

  it('togglear un bot cuando la simulación está detenida llama a setBotSelectionRequest', async () => {
    const user = userEvent.setup();
    setupHooks({ bots: [makeBot()], roster: [] });
    apiMocks.setBotSelectionRequest.mockResolvedValue(undefined);

    renderPanel();

    const checkbox = screen.getByRole('checkbox', { name: /bot competitivo/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    await waitFor(() => expect(apiMocks.setBotSelectionRequest).toHaveBeenCalledWith('remate-1', ['bot-1']));
  });

  it('el checklist queda deshabilitado mientras la simulación corre', () => {
    setupHooks({
      bots: [makeBot()],
      roster: [makeRosterEntry()],
      run: { remate_id: 'remate-1', status: 'running', started_at: null, paused_at: null, stopped_at: null, stop_reason: null },
    });

    renderPanel();

    expect(screen.getByRole('checkbox', { name: /bot competitivo/i })).toBeDisabled();
    expect(screen.getByText(/detené la simulación para cambiar/i)).toBeInTheDocument();
  });

  it('detenida: muestra "Iniciar simuladores" y lo dispara', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    setupHooks({ bots: [makeBot()], roster: [makeRosterEntry()], run: null, reload });
    apiMocks.startBotSimulationRequest.mockResolvedValue({});

    renderPanel();

    await user.click(screen.getByRole('button', { name: /iniciar simuladores/i }));

    await waitFor(() => expect(apiMocks.startBotSimulationRequest).toHaveBeenCalledWith('remate-1'));
    expect(toastPushMock).toHaveBeenCalledWith('success', 'Simuladores iniciados.');
    expect(reload).toHaveBeenCalled();
  });

  it('corriendo: muestra "Pausar" y "Detener", y ambos disparan su acción', async () => {
    const user = userEvent.setup();
    setupHooks({
      bots: [makeBot()],
      roster: [makeRosterEntry()],
      run: { remate_id: 'remate-1', status: 'running', started_at: null, paused_at: null, stopped_at: null, stop_reason: null },
    });
    apiMocks.pauseBotSimulationRequest.mockResolvedValue({});
    apiMocks.stopBotSimulationRequest.mockResolvedValue({});

    renderPanel();

    await user.click(screen.getByRole('button', { name: /pausar simuladores/i }));
    await waitFor(() => expect(apiMocks.pauseBotSimulationRequest).toHaveBeenCalledWith('remate-1'));

    await user.click(screen.getByRole('button', { name: /detener simuladores/i }));
    await waitFor(() => expect(apiMocks.stopBotSimulationRequest).toHaveBeenCalledWith('remate-1'));
  });

  it('pausada: muestra "Reanudar simuladores", que llama al mismo endpoint de start', async () => {
    const user = userEvent.setup();
    setupHooks({
      bots: [makeBot()],
      roster: [makeRosterEntry()],
      run: { remate_id: 'remate-1', status: 'paused', started_at: null, paused_at: null, stopped_at: null, stop_reason: null },
    });
    apiMocks.startBotSimulationRequest.mockResolvedValue({});

    renderPanel();

    await user.click(screen.getByRole('button', { name: /reanudar simuladores/i }));
    await waitFor(() => expect(apiMocks.startBotSimulationRequest).toHaveBeenCalledWith('remate-1'));
  });
});
