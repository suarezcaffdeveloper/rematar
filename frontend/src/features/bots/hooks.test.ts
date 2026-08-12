import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { BotProfile, BotRosterEntry, BotSimulationRun } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchBotProfilesRequest: vi.fn(),
  fetchBotRosterRequest: vi.fn(),
  fetchBotSimulationRequest: vi.fn(),
  createBotProfileRequest: vi.fn(),
  updateBotProfileRequest: vi.fn(),
  deleteBotProfileRequest: vi.fn(),
  setBotSelectionRequest: vi.fn(),
  startBotSimulationRequest: vi.fn(),
  pauseBotSimulationRequest: vi.fn(),
  stopBotSimulationRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useBotProfiles, useBotSimulation } = await import('./hooks');

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
    participates_in_chat: true,
    chat_message_frequency: '0.30',
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

function makeRun(overrides: Partial<BotSimulationRun> = {}): BotSimulationRun {
  return {
    remate_id: 'remate-1',
    status: 'running',
    started_at: '2026-08-11T10:00:00Z',
    paused_at: null,
    stopped_at: null,
    stop_reason: null,
    ...overrides,
  };
}

describe('useBotProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carga la lista de bots propios', async () => {
    apiMocks.fetchBotProfilesRequest.mockResolvedValue([makeBot()]);

    const { result } = renderHook(() => useBotProfiles());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.bots).toHaveLength(1);
    expect(result.current.bots[0].display_name).toBe('Bot Competitivo');
  });

  it('ante un error, expone el error normalizado', async () => {
    apiMocks.fetchBotProfilesRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: { code: 'http_error', message: 'Error del servidor.' } } },
    });

    const { result } = renderHook(() => useBotProfiles());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('Error del servidor.');
  });
});

describe('useBotSimulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchBotRosterRequest.mockResolvedValue([]);
    apiMocks.fetchBotSimulationRequest.mockResolvedValue(null);
  });

  it('carga roster y estado de simulación juntos', async () => {
    apiMocks.fetchBotRosterRequest.mockResolvedValue([makeRosterEntry()]);
    apiMocks.fetchBotSimulationRequest.mockResolvedValue(makeRun());

    const { result } = renderHook(() => useBotSimulation('remate-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.roster).toHaveLength(1);
    expect(result.current.run?.status).toBe('running');
    expect(apiMocks.fetchBotRosterRequest).toHaveBeenCalledWith('remate-1');
    expect(apiMocks.fetchBotSimulationRequest).toHaveBeenCalledWith('remate-1');
  });

  it('run es null cuando la simulación nunca se inició', async () => {
    const { result } = renderHook(() => useBotSimulation('remate-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.run).toBeNull();
    expect(result.current.roster).toEqual([]);
  });

  it('no pide nada con un remateId vacío', async () => {
    const { result } = renderHook(() => useBotSimulation(''));

    expect(result.current.isLoading).toBe(true);
    expect(apiMocks.fetchBotRosterRequest).not.toHaveBeenCalled();
    expect(apiMocks.fetchBotSimulationRequest).not.toHaveBeenCalled();
  });
});
