import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectedUsersList } from './ConnectedUsersList';

describe('ConnectedUsersList', () => {
  it('con connectedUsers null (viewer no privilegiado), no renderiza nada', () => {
    const { container } = render(<ConnectedUsersList connectedUsers={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con lista vacía, muestra el mensaje de "nadie conectado"', () => {
    render(<ConnectedUsersList connectedUsers={[]} />);
    expect(screen.getByText('Todavía no hay nadie conectado.')).toBeInTheDocument();
  });

  it('lista cada conexión con un identificador truncado del usuario, ordenada por conexión más antigua primero', () => {
    render(
      <ConnectedUsersList
        connectedUsers={[
          { connection_id: 'conn-2', user_id: 'user-22222222', connected_at: '2026-07-01T10:05:00Z' },
          { connection_id: 'conn-1', user_id: 'user-11111111', connected_at: '2026-07-01T10:00:00Z' },
        ]}
      />,
    );

    expect(screen.getByText('2')).toBeInTheDocument(); // conteo
    const entries = screen.getAllByText(/^Usuario #/);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Usuario #user-111'); // el más antiguo primero
    expect(entries[1]).toHaveTextContent('Usuario #user-222');
  });

  it('dos conexiones del mismo usuario (multi-pestaña) aparecen como dos entradas separadas', () => {
    render(
      <ConnectedUsersList
        connectedUsers={[
          { connection_id: 'tab-1', user_id: 'user-abcdefgh', connected_at: '2026-07-01T10:00:00Z' },
          { connection_id: 'tab-2', user_id: 'user-abcdefgh', connected_at: '2026-07-01T10:01:00Z' },
        ]}
      />,
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('Usuario #user-abc')).toHaveLength(2);
  });
});
