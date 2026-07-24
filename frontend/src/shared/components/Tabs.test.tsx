import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from './Tabs';

const TABS = [
  { id: 'a', label: 'Uno' },
  { id: 'b', label: 'Dos' },
];

/** `Tabs` es controlado -- para probar navegación de varios pasos hace falta un
 * wrapper con estado real (mismo patrón que cualquier consumidor real, ej.
 * `AdminAuditLogPage`), no alcanza con un `onChange` espía que nunca actualiza `activeId`. */
function ControlledTabs({ onChange }: { onChange: (id: string) => void }) {
  const [activeId, setActiveId] = useState('a');
  return (
    <Tabs
      tabs={TABS}
      activeId={activeId}
      onChange={(id) => {
        setActiveId(id);
        onChange(id);
      }}
    />
  );
}

describe('Tabs', () => {
  it('marca la pestaña activa con aria-selected', () => {
    render(<Tabs tabs={TABS} activeId="a" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('aria-selected', 'false');
  });

  it('clickear una pestaña llama a onChange con su id', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeId="a" onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Dos' }));

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('solo la pestaña activa es alcanzable por Tab (tabindex "roving")', () => {
    render(<Tabs tabs={TABS} activeId="a" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight/ArrowLeft llaman a onChange con la pestaña siguiente/anterior, con wraparound, y mueven el foco', async () => {
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);

    screen.getByRole('tab', { name: 'Uno' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('Home/End van a la primera/última pestaña', async () => {
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);

    screen.getByRole('tab', { name: 'Uno' }).focus();
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('b');

    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });
});
