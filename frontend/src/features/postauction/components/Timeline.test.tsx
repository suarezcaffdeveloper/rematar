import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from './Timeline';
import type { TimelineEntry } from '../types';

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'entry-1',
    occurred_at: '2026-07-20T10:00:00Z',
    actor_id: 'user-1',
    actor_name: 'Ana Rematadora',
    actor_role: 'rematador',
    action: 'status_changed',
    previous_status: 'adjudicado',
    new_status: 'pendiente_contacto',
    note: null,
    ...overrides,
  };
}

describe('Timeline', () => {
  it('muestra un estado vacío cuando no hay entradas', () => {
    render(<Timeline entries={[]} />);
    expect(screen.getByText('Sin actividad registrada')).toBeInTheDocument();
  });

  it('muestra acción, actor y la transición de estado', () => {
    render(<Timeline entries={[makeEntry()]} />);

    expect(screen.getByText('Cambio de estado')).toBeInTheDocument();
    expect(screen.getByText('Ana Rematadora')).toBeInTheDocument();
    expect(screen.getByText('Adjudicado → Pendiente de contacto')).toBeInTheDocument();
  });

  it('muestra la observación cuando existe', () => {
    render(<Timeline entries={[makeEntry({ note: 'Pidió factura A' })]} />);
    expect(screen.getByText('"Pidió factura A"')).toBeInTheDocument();
  });

  it('usa "Sistema" cuando la entrada no tiene actor (creación automática)', () => {
    render(
      <Timeline
        entries={[
          makeEntry({
            action: 'case_created',
            actor_id: null,
            actor_name: null,
            actor_role: null,
            previous_status: null,
            new_status: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Sistema')).toBeInTheDocument();
    expect(screen.getByText('Caso creado (lote adjudicado)')).toBeInTheDocument();
  });
});
