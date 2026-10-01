import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolaQuickPanels } from './ConsolaQuickPanels';
import type { Remate } from '../../remates/types';

// El contenido de cada globito (formulario de YouTube / datos del martillero) ya tiene
// su propia cobertura (`StreamPanel.test.tsx`/`OperatorCodePanel.test.tsx`) -- acá
// interesa la mecánica de los botones/globitos (abrir, cerrar, exclusión mutua), no los
// campos de adentro.
vi.mock('./StreamPanel', () => ({
  StreamPanel: ({ variant, onClose }: { variant?: string; onClose?: () => void }) => (
    <div>
      Stream ({variant})
      <button type="button" onClick={onClose}>
        Cerrar desde adentro (stream)
      </button>
    </div>
  ),
}));
vi.mock('./OperatorCodePanel', () => ({
  OperatorCodePanel: ({ variant, onClose }: { variant?: string; onClose?: () => void }) => (
    <div>
      Operator ({variant})
      <button type="button" onClick={onClose}>
        Cerrar desde adentro (operator)
      </button>
    </div>
  ),
}));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
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
  } as Remate;
}

describe('ConsolaQuickPanels', () => {
  it('empresa dueña: muestra los dos botones, ninguno abierto por default', () => {
    render(<ConsolaQuickPanels remate={makeRemate()} isOwner onRemateChange={() => {}} />);

    expect(screen.getByRole('button', { name: /Transmisión/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Martillero/ })).toBeInTheDocument();
    expect(screen.queryByText(/Stream \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Operator \(/)).not.toBeInTheDocument();
  });

  it('rematador operador (no dueño): solo el botón de Transmisión', () => {
    render(<ConsolaQuickPanels remate={makeRemate()} isOwner={false} onRemateChange={() => {}} />);

    expect(screen.getByRole('button', { name: /Transmisión/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Martillero/ })).not.toBeInTheDocument();
  });

  it('remate finalizado: no muestra ningún botón', () => {
    const { container } = render(
      <ConsolaQuickPanels remate={makeRemate({ status: 'finished' })} isOwner onRemateChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('clic en Transmisión abre el globito rojo; clic de nuevo lo cierra', async () => {
    render(<ConsolaQuickPanels remate={makeRemate()} isOwner onRemateChange={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Transmisión/ }));
    expect(screen.getByText('Stream (popover)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Transmisión/ }));
    expect(screen.queryByText('Stream (popover)')).not.toBeInTheDocument();
  });

  it('abrir Martillero cierra el globito de Transmisión (los dos ocupan el mismo lugar)', async () => {
    render(<ConsolaQuickPanels remate={makeRemate()} isOwner onRemateChange={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Transmisión/ }));
    expect(screen.getByText('Stream (popover)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Martillero/ }));
    expect(screen.queryByText('Stream (popover)')).not.toBeInTheDocument();
    expect(screen.getByText('Operator (popover)')).toBeInTheDocument();
  });

  it('la X de adentro del globito también lo cierra', async () => {
    render(<ConsolaQuickPanels remate={makeRemate()} isOwner onRemateChange={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Martillero/ }));
    expect(screen.getByText('Operator (popover)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar desde adentro (operator)' }));
    expect(screen.queryByText('Operator (popover)')).not.toBeInTheDocument();
  });
});
