import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OperatorCodeDrawer } from './OperatorCodeDrawer';
import type { Remate } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({ generateOperatorCodeRequest: vi.fn() }));
vi.mock('../../remates/api', () => apiMocks);
vi.mock('../hooks', () => ({ useRemateOperationalInfo: () => ({ loteCount: 3 }) }));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    title: 'Remate de hacienda',
    rematador_id: null,
    starts_at: '2099-07-18T10:00:00Z',
    status: 'scheduled',
    ...overrides,
  } as Remate;
}

function renderDrawer(remate: Remate, onGenerated = vi.fn()) {
  render(
    <MemoryRouter>
      <OperatorCodeDrawer remate={remate} isOpen onClose={vi.fn()} onGenerated={onGenerated} />
    </MemoryRouter>,
  );
  return onGenerated;
}

describe('OperatorCodeDrawer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin código generado muestra el ID y el estado "Sin generar"', () => {
    renderDrawer(makeRemate());
    expect(screen.getByText('remate-1')).toBeInTheDocument();
    expect(screen.getByText('Sin generar')).toBeInTheDocument();
    expect(screen.getByText('3 lotes cargados')).toBeInTheDocument();
  });

  it('genera el código, lo muestra y avisa al dashboard', async () => {
    apiMocks.generateOperatorCodeRequest.mockResolvedValue({ code: 'ABC-123', generated_at: new Date().toISOString() });
    const onGenerated = renderDrawer(makeRemate());

    await userEvent.click(screen.getByRole('button', { name: 'Generar código' }));

    await waitFor(() => expect(screen.getByText('ABC-123')).toBeInTheDocument());
    expect(onGenerated).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copiar datos para enviar' })).toBeInTheDocument();
  });

  it('con operador asignado pide confirmación antes de regenerar', async () => {
    renderDrawer(makeRemate({ rematador_id: 'user-9', operator_code_generated_at: '2026-07-01T00:00:00Z' }));

    await userEvent.click(screen.getByRole('button', { name: 'Generar código nuevo' }));

    expect(apiMocks.generateOperatorCodeRequest).not.toHaveBeenCalled();
    expect(await screen.findByText('Regenerar código de operador')).toBeInTheDocument();
  });
});
