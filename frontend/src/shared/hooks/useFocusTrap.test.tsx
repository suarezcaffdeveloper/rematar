import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap';

function TestHarness({ isActive }: { isActive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isActive);

  return (
    <div>
      <button type="button">Afuera (antes)</button>
      <div ref={containerRef}>
        <button type="button">Primero</button>
        <button type="button">Último</button>
      </div>
      <button type="button">Afuera (después)</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('Tab en el último elemento vuelve al primero (wraparound)', async () => {
    const user = userEvent.setup();
    const { getByText } = render(<TestHarness isActive />);

    getByText('Último').focus();
    await user.tab();

    expect(getByText('Primero')).toHaveFocus();
  });

  it('Shift+Tab en el primer elemento vuelve al último (wraparound)', async () => {
    const user = userEvent.setup();
    const { getByText } = render(<TestHarness isActive />);

    getByText('Primero').focus();
    await user.tab({ shift: true });

    expect(getByText('Último')).toHaveFocus();
  });

  it('restaura el foco al elemento que lo tenía al activarse, aunque el foco se haya movido adentro mientras tanto', () => {
    const { getByText, rerender } = render(<TestHarness isActive={false} />);

    const trigger = getByText('Afuera (antes)');
    trigger.focus();

    rerender(<TestHarness isActive />);
    getByText('Primero').focus();
    expect(getByText('Primero')).toHaveFocus();

    rerender(<TestHarness isActive={false} />);

    expect(trigger).toHaveFocus();
  });

  it('inactivo, Tab no queda atrapado dentro del contenedor', async () => {
    const user = userEvent.setup();
    const { getByText } = render(<TestHarness isActive={false} />);

    getByText('Último').focus();
    await user.tab();

    expect(getByText('Afuera (después)')).toHaveFocus();
  });
});
