import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from './TypingIndicator';
import type { TypingUser } from '../types';

function makeTyping(overrides: Partial<TypingUser> = {}): TypingUser {
  return { user_id: 'user-1', user_name: 'Juan', lastSeenAt: Date.now(), ...overrides };
}

describe('TypingIndicator', () => {
  it('sin usuarios escribiendo, no muestra texto', () => {
    const { container } = render(<TypingIndicator typingUsers={[]} />);
    expect(container.querySelector('span')).not.toBeInTheDocument();
  });

  it('un usuario escribiendo, en singular', () => {
    render(<TypingIndicator typingUsers={[makeTyping({ user_name: 'Juan' })]} />);
    expect(screen.getByText('Juan está escribiendo...')).toBeInTheDocument();
  });

  it('dos usuarios escribiendo, nombra a ambos', () => {
    render(
      <TypingIndicator
        typingUsers={[
          makeTyping({ user_id: 'user-1', user_name: 'Juan' }),
          makeTyping({ user_id: 'user-2', user_name: 'Pedro' }),
        ]}
      />,
    );
    expect(screen.getByText('Juan y Pedro están escribiendo...')).toBeInTheDocument();
  });

  it('tres o más usuarios escribiendo, muestra el conteo', () => {
    render(
      <TypingIndicator
        typingUsers={[
          makeTyping({ user_id: 'user-1' }),
          makeTyping({ user_id: 'user-2' }),
          makeTyping({ user_id: 'user-3' }),
        ]}
      />,
    );
    expect(screen.getByText('3 personas están escribiendo...')).toBeInTheDocument();
  });
});
