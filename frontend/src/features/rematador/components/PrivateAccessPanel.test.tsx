import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivateAccessPanel } from './PrivateAccessPanel';
import type { Remate } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({
  generatePrivateAccessCodeRequest: vi.fn(),
  getPrivateAccessCodeRequest: vi.fn(),
}));
vi.mock('../../remates/api', () => apiMocks);

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    rematador_id: null,
    title: 'Remate privado de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-07-18T10:00:00Z',
    ends_at: null,
    status: 'scheduled',
    access_type: 'private',
    private_access_code_generated_at: null,
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Remate;
}

describe('PrivateAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue(null);
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://rematar.test' },
      writable: true,
    });
  });

  it('muestra el encabezado de la consola y la URL del remate, copiable', async () => {
    render(<PrivateAccessPanel remate={makeRemate()} />);

    expect(screen.getByText('Datos de acceso privado')).toBeInTheDocument();
    await screen.findByText('https://rematar.test/remates/remate-1');
  });

  it('al montar, trae el código ACTUAL sin necesidad de ningún clic', async () => {
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue({
      code: 'A3K7P2QXHT',
      generated_at: '2026-07-18T10:00:00Z',
    });

    render(<PrivateAccessPanel remate={makeRemate({ private_access_code_generated_at: '2026-07-18T10:00:00Z' })} />);

    expect(apiMocks.getPrivateAccessCodeRequest).toHaveBeenCalledWith('remate-1');
    expect(await screen.findByText('A3K7P2QXHT')).toBeInTheDocument();
    expect(apiMocks.generatePrivateAccessCodeRequest).not.toHaveBeenCalled();
  });

  it('sin código generado todavía, muestra el estado vacío', async () => {
    render(<PrivateAccessPanel remate={makeRemate()} />);

    expect(await screen.findByText('Sin generar')).toBeInTheDocument();
    expect(screen.getByText('Falta generar')).toBeInTheDocument();
  });

  it('"Regenerar código" no pide confirmación y reemplaza el código mostrado', async () => {
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue({
      code: 'A3K7P2QXHT',
      generated_at: '2026-07-18T10:00:00Z',
    });
    apiMocks.generatePrivateAccessCodeRequest.mockResolvedValue({
      code: 'B4L8Q3RYIU',
      generated_at: '2026-07-18T11:00:00Z',
    });

    render(<PrivateAccessPanel remate={makeRemate({ private_access_code_generated_at: '2026-07-18T10:00:00Z' })} />);
    await screen.findByText('A3K7P2QXHT');

    await userEvent.click(screen.getByRole('button', { name: 'Regenerar código' }));

    expect(apiMocks.generatePrivateAccessCodeRequest).toHaveBeenCalledWith('remate-1');
    expect(await screen.findByText('B4L8Q3RYIU')).toBeInTheDocument();
  });

  it('"Copiar datos (JSON)" copia URL + código actual como JSON', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue({
      code: 'A3K7P2QXHT',
      generated_at: '2026-07-18T10:00:00Z',
    });

    render(<PrivateAccessPanel remate={makeRemate({ id: 'remate-7', private_access_code_generated_at: '2026-07-18T10:00:00Z' })} />);
    await screen.findByText('A3K7P2QXHT');

    await userEvent.click(screen.getByRole('button', { name: 'Copiar datos (JSON)' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ url: 'https://rematar.test/remates/remate-7', code: 'A3K7P2QXHT' }),
    );
  });

  it('"Copiar datos (JSON)" está deshabilitado mientras no hay código', async () => {
    render(<PrivateAccessPanel remate={makeRemate()} />);

    await screen.findByText('Sin generar');
    expect(screen.getByRole('button', { name: 'Copiar datos (JSON)' })).toBeDisabled();
  });
});
