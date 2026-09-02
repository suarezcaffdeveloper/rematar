import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivateAccessCredentialsPopover } from './PrivateAccessCredentialsPopover';
import type { Remate } from '../../remates/types';

const apiMocks = vi.hoisted(() => ({
  generatePrivateAccessCodeRequest: vi.fn(),
  getPrivateAccessCodeRequest: vi.fn(),
}));
vi.mock('../../remates/api', () => apiMocks);

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-9',
    owner_id: 'owner-1',
    rematador_id: null,
    title: 'Remate privado de campo',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: '2026-07-18T10:00:00Z',
    ends_at: null,
    status: 'draft',
    access_type: 'private',
    private_access_code_generated_at: '2026-07-18T10:00:00Z',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Remate;
}

describe('PrivateAccessCredentialsPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://rematar.test' },
      writable: true,
    });
  });

  it('cerrado, no muestra nada', () => {
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue(null);
    render(<PrivateAccessCredentialsPopover isOpen={false} onClose={vi.fn()} remate={makeRemate()} />);

    expect(screen.queryByText('Credenciales de acceso privado')).not.toBeInTheDocument();
  });

  it('abierto, antes de iniciar el remate (draft), muestra el mismo código generado al crear', async () => {
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue({
      code: 'A3K7P2QXHT',
      generated_at: '2026-07-18T10:00:00Z',
    });

    render(<PrivateAccessCredentialsPopover isOpen onClose={vi.fn()} remate={makeRemate()} />);

    expect(screen.getByText('Credenciales de acceso privado')).toBeInTheDocument();
    expect(apiMocks.getPrivateAccessCodeRequest).toHaveBeenCalledWith('remate-9');
    expect(await screen.findByText('A3K7P2QXHT')).toBeInTheDocument();
    expect(screen.getByText('https://rematar.test/remates/remate-9')).toBeInTheDocument();
    expect(apiMocks.generatePrivateAccessCodeRequest).not.toHaveBeenCalled();
  });

  it('permite regenerar el código sin salir del popover', async () => {
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue({
      code: 'A3K7P2QXHT',
      generated_at: '2026-07-18T10:00:00Z',
    });
    apiMocks.generatePrivateAccessCodeRequest.mockResolvedValue({
      code: 'B4L8Q3RYIU',
      generated_at: '2026-07-18T11:00:00Z',
    });

    render(<PrivateAccessCredentialsPopover isOpen onClose={vi.fn()} remate={makeRemate()} />);
    await screen.findByText('A3K7P2QXHT');

    await userEvent.click(screen.getByRole('button', { name: 'Regenerar código' }));

    expect(await screen.findByText('B4L8Q3RYIU')).toBeInTheDocument();
  });

  it('el botón "Copiar datos (JSON)" copia URL + código', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    apiMocks.getPrivateAccessCodeRequest.mockResolvedValue({
      code: 'A3K7P2QXHT',
      generated_at: '2026-07-18T10:00:00Z',
    });

    render(<PrivateAccessCredentialsPopover isOpen onClose={vi.fn()} remate={makeRemate()} />);
    await screen.findByText('A3K7P2QXHT');

    await userEvent.click(screen.getByRole('button', { name: 'Copiar datos (JSON)' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ url: 'https://rematar.test/remates/remate-9', code: 'A3K7P2QXHT' }),
    );
  });
});
