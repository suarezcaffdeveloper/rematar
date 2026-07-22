import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatActivityCard } from './ChatActivityCard';

describe('ChatActivityCard', () => {
  it('muestra mensajes, participantes y moderados', () => {
    render(
      <ChatActivityCard activity={{ message_count: 12, participant_count: 4, deleted_count: 1 }} />,
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Mensajes')).toBeInTheDocument();
    expect(screen.getByText('Participantes')).toBeInTheDocument();
    expect(screen.getByText('Moderados')).toBeInTheDocument();
  });

  it('sin actividad, muestra ceros sin romper', () => {
    render(<ChatActivityCard activity={{ message_count: 0, participant_count: 0, deleted_count: 0 }} />);
    expect(screen.getAllByText('0')).toHaveLength(3);
  });
});
