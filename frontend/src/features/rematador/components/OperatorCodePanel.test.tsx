import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OperatorCodePanel } from './OperatorCodePanel';
import type { Remate } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({ generateOperatorCodeRequest: vi.fn() }));
vi.mock('../../remates/api', () => apiMocks);

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    rematador_id: null,
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-07-18T10:00:00Z',
    ends_at: null,
    status: 'scheduled',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Remate;
}

describe('OperatorCodePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('siempre muestra el ID del remate, copiable', () => {
    render(<OperatorCodePanel remate={makeRemate()} />);

    expect(screen.getByText('remate-1')).toBeInTheDocument();
  });

  it('sin código generado ni operador asignado, muestra el estado vacío', () => {
    render(<OperatorCodePanel remate={makeRemate()} />);

    expect(screen.getByText('Sin generar')).toBeInTheDocument();
    expect(screen.getByText('Falta generar')).toBeInTheDocument();
    expect(screen.queryByText('Operador asignado')).not.toBeInTheDocument();
  });

  it('al generar el código, lo muestra en pantalla', async () => {
    apiMocks.generateOperatorCodeRequest.mockResolvedValue({ code: 'A3K7P2QX' });

    render(<OperatorCodePanel remate={makeRemate()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Generar código' }));

    expect(apiMocks.generateOperatorCodeRequest).toHaveBeenCalledWith('remate-1');
    expect(await screen.findByText('A3K7P2QX')).toBeInTheDocument();
  });

  it('con un rematador ya asignado, muestra el badge y pide confirmación antes de regenerar', async () => {
    render(<OperatorCodePanel remate={makeRemate({ rematador_id: 'rematador-1' })} />);

    expect(screen.getByText('Operador asignado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Regenerar código' }));

    expect(screen.getByText('Regenerar código de operador')).toBeInTheDocument();
    expect(apiMocks.generateOperatorCodeRequest).not.toHaveBeenCalled();
  });

  it('"Copiar datos" está deshabilitado hasta que hay un código generado', () => {
    render(<OperatorCodePanel remate={makeRemate()} />);

    expect(screen.getByRole('button', { name: 'Copiar datos' })).toBeDisabled();
  });

  it('"Copiar datos" copia el ID y el código juntos, uno por línea', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    apiMocks.generateOperatorCodeRequest.mockResolvedValue({ code: 'A3K7P2QX' });

    render(<OperatorCodePanel remate={makeRemate({ id: 'remate-7' })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Generar código' }));
    await screen.findByText('A3K7P2QX');

    await userEvent.click(screen.getByRole('button', { name: 'Copiar datos' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'ID del remate: remate-7\nCódigo de acceso: A3K7P2QX',
    );
  });
});
