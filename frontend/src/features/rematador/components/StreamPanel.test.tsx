import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Remate } from '../../remates/types';
import { StreamPanel } from './StreamPanel';

const setStream = vi.fn();
const clearStream = vi.fn();
vi.mock('../../remates/api', () => ({
  setRemateStreamRequest: (...args: unknown[]) => setStream(...args),
  clearRemateStreamRequest: (...args: unknown[]) => clearStream(...args),
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: 't',
    updated_at: 't',
    ...overrides,
  };
}

describe('StreamPanel', () => {
  beforeEach(() => {
    setStream.mockReset();
    clearStream.mockReset();
  });

  it('publica el link pegado (sin espacios) y avisa al padre', async () => {
    const updated = makeRemate({ stream_provider: 'youtube', stream_video_id: 'dQw4w9WgXcQ' });
    setStream.mockResolvedValue(updated);
    const onChange = vi.fn();
    render(<StreamPanel remate={makeRemate()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Link de YouTube'), {
      target: { value: '  https://youtu.be/dQw4w9WgXcQ ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(updated));
    expect(setStream).toHaveBeenCalledWith('remate-1', 'https://youtu.be/dQw4w9WgXcQ');
  });

  it('no llama al backend con el campo vacío', () => {
    render(<StreamPanel remate={makeRemate()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(setStream).not.toHaveBeenCalled();
    expect(screen.getByText(/Pegá el link/)).toBeInTheDocument();
  });

  it('muestra un error cuando el backend rechaza el link', async () => {
    setStream.mockRejectedValue(new Error('boom'));
    render(<StreamPanel remate={makeRemate()} />);

    fireEvent.change(screen.getByLabelText('Link de YouTube'), { target: { value: 'https://evil.io/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(setStream).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Link de YouTube')).toHaveAttribute('aria-invalid', 'true'));
  });

  it('con transmisión activa muestra la vista previa y permite quitarla', async () => {
    clearStream.mockResolvedValue(makeRemate());
    render(<StreamPanel remate={makeRemate({ stream_provider: 'youtube', stream_video_id: 'dQw4w9WgXcQ' })} />);

    expect(screen.getByTitle('Vista previa de la transmisión')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    await waitFor(() => expect(clearStream).toHaveBeenCalledWith('remate-1'));
  });

  it('recomienda "No listado" en un remate privado', () => {
    render(<StreamPanel remate={makeRemate({ access_type: 'private' })} />);
    expect(screen.getByText(/No listado/)).toBeInTheDocument();
  });
});
