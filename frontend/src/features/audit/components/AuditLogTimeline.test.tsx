import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogTimeline } from './AuditLogTimeline';
import type { AuditLogEntry } from '../types';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'entry-1',
    occurred_at: '2026-07-21T10:00:00Z',
    actor_id: 'user-1',
    actor_name: 'Ana Rematadora',
    actor_role: 'rematador',
    action: 'remate.created',
    resource_type: 'remate',
    resource_id: 'remate-1',
    remate_id: 'remate-1',
    details: null,
    ...overrides,
  };
}

describe('AuditLogTimeline', () => {
  it('sin entradas, muestra el estado vacío', () => {
    render(<AuditLogTimeline entries={[]} />);
    expect(screen.getByText('Sin actividad registrada')).toBeInTheDocument();
  });

  it('agrupa entradas del mismo día bajo un único encabezado', () => {
    const entries = [
      makeEntry({ id: 'a', occurred_at: '2026-07-21T09:00:00Z', action: 'remate.created' }),
      makeEntry({ id: 'b', occurred_at: '2026-07-21T15:30:00Z', action: 'lote.opened' }),
    ];
    render(<AuditLogTimeline entries={entries} />);

    expect(screen.getAllByText(/2026/)).toHaveLength(1);
    expect(screen.getByText('Remate creado')).toBeInTheDocument();
    expect(screen.getByText('Lote abierto')).toBeInTheDocument();
  });

  it('entradas de días distintos generan encabezados distintos', () => {
    const entries = [
      makeEntry({ id: 'a', occurred_at: '2026-07-20T09:00:00Z' }),
      makeEntry({ id: 'b', occurred_at: '2026-07-21T09:00:00Z' }),
    ];
    render(<AuditLogTimeline entries={entries} />);

    expect(screen.getAllByText(/2026/)).toHaveLength(2);
  });

  it('una acción sin etiqueta conocida muestra el string crudo como fallback', () => {
    render(<AuditLogTimeline entries={[makeEntry({ action: 'algo.nuevo' })]} />);
    expect(screen.getByText('algo.nuevo')).toBeInTheDocument();
  });
});
