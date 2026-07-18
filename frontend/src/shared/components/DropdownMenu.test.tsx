import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu } from './DropdownMenu';

describe('DropdownMenu', () => {
  it('cerrado por default, no muestra los ítems', () => {
    render(<DropdownMenu items={[{ label: 'Editar', onSelect: vi.fn() }]} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clickear el trigger abre el menú con los ítems', async () => {
    render(
      <DropdownMenu
        items={[
          { label: 'Editar', onSelect: vi.fn() },
          { label: 'Eliminar', onSelect: vi.fn(), variant: 'danger' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('clickear un ítem lo ejecuta y cierra el menú', async () => {
    const onSelect = vi.fn();
    render(<DropdownMenu items={[{ label: 'Duplicar', onSelect }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('un ítem deshabilitado no llama a onSelect', async () => {
    const onSelect = vi.fn();
    render(<DropdownMenu items={[{ label: 'Publicar', onSelect, disabled: true }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));

    expect(screen.getByRole('menuitem', { name: 'Publicar' })).toBeDisabled();
  });

  it('clickear afuera cierra el menú', async () => {
    render(
      <div>
        <DropdownMenu items={[{ label: 'Editar', onSelect: vi.fn() }]} />
        <button type="button">Afuera</button>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Afuera' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('la tecla Escape cierra el menú', async () => {
    render(<DropdownMenu items={[{ label: 'Editar', onSelect: vi.fn() }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
