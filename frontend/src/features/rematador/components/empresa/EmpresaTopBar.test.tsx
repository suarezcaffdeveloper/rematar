import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Lote, Remate } from '../../../remates/types';
import type { OfertaSnapshotEntry } from '../../../sala/types';
import { EmpresaTopBar } from './EmpresaTopBar';

const remate = { id: 'r1', title: 'Remate de primavera', status: 'live' } as Remate;
const lote = { lot_number: '3', title: 'Toro', base_price: '1000.00' } as Lote;
const offer = { id: 'o1', amount: '1250.00' } as OfertaSnapshotEntry;

function setup(props: Partial<React.ComponentProps<typeof EmpresaTopBar>> = {}) {
  const onOpenQuestions = vi.fn();
  render(
    <MemoryRouter>
      <EmpresaTopBar
        remate={remate} activeLote={lote} winningOffer={offer} elapsed="12:05" connectionStatus="open" currency="ARS"
        raised="$ 5.000" connectedUsers={8} pendingQuestions={2} urgentAlerts={1}
        onOpenQuestions={onOpenQuestions} onOpenAlerts={vi.fn()} {...props}
      />
    </MemoryRouter>,
  );
  return onOpenQuestions;
}

describe('EmpresaTopBar', () => {
  it('muestra remate, estado, lote en remate y oferta líder con su suba', () => {
    setup();
    expect(screen.getByText('Remate de primavera')).toBeInTheDocument();
    expect(screen.getByText('En vivo')).toBeInTheDocument();
    expect(screen.getByText('Toro')).toBeInTheDocument();
    expect(screen.getByText('+25 %')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a Mis remates/ })).toHaveAttribute('href', '/');
  });

  it('el botón de preguntas abre la bandeja', async () => {
    const onOpen = setup();
    await userEvent.click(screen.getByRole('button', { name: /2 preguntas/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('entre lotes no inventa datos', () => {
    setup({ activeLote: null, winningOffer: null, pendingQuestions: 0, urgentAlerts: 0 });
    expect(screen.getByText('Entre lotes')).toBeInTheDocument();
    expect(screen.queryByText(/pregunta/)).toBeNull();
  });
});
