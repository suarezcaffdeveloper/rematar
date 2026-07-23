import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteForm } from './NoteForm';

const apiMocks = vi.hoisted(() => ({
  addVentaNotaRequest: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NoteForm', () => {
  it('envía la observación y limpia el campo al terminar', async () => {
    apiMocks.addVentaNotaRequest.mockResolvedValue({});
    const onAdded = vi.fn();
    const user = userEvent.setup();

    render(<NoteForm caseId="case-1" onAdded={onAdded} />);
    const textarea = screen.getByLabelText('Nueva observación');
    await user.type(textarea, 'El comprador pidió envío urgente.');
    await user.click(screen.getByRole('button', { name: 'Agregar observación' }));

    expect(apiMocks.addVentaNotaRequest).toHaveBeenCalledWith(
      'case-1',
      'El comprador pidió envío urgente.',
    );
    expect(onAdded).toHaveBeenCalled();
  });

  it('no envía una observación vacía', async () => {
    const user = userEvent.setup();
    render(<NoteForm caseId="case-1" onAdded={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Agregar observación' }));

    expect(apiMocks.addVentaNotaRequest).not.toHaveBeenCalled();
  });
});
