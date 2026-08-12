import type { BotPersonality, BotSimulationStatus } from './types';

export const PERSONALITY_LABELS: Record<BotPersonality, string> = {
  conservative: 'Conservador',
  competitive: 'Competitivo',
  aggressive: 'Agresivo',
};

export const PERSONALITY_DESCRIPTIONS: Record<BotPersonality, string> = {
  conservative: 'Ofertas cerca del incremento mínimo, reacciona lento y abandona antes.',
  competitive: 'Mantiene la competencia, reacciona con tiempos moderados.',
  aggressive: 'Reacciona rápido y tiende a acercarse a su presupuesto máximo.',
};

export const PERSONALITY_BADGE_VARIANTS: Record<BotPersonality, 'neutral' | 'brand' | 'warning'> = {
  conservative: 'neutral',
  competitive: 'brand',
  aggressive: 'warning',
};

export const SIMULATION_STATUS_LABELS: Record<BotSimulationStatus, string> = {
  running: 'Corriendo',
  paused: 'Pausada',
  stopped: 'Detenida',
};

export const SIMULATION_STATUS_BADGE_VARIANTS: Record<BotSimulationStatus, 'success' | 'warning' | 'neutral'> = {
  running: 'success',
  paused: 'warning',
  stopped: 'neutral',
};
