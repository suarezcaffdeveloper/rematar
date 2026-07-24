import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('no muestra el contenido hasta hacer hover/foco en el disparador', () => {
    render(
      <Tooltip content="Info adicional">
        <button type="button">Ayuda</button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('el foco por teclado muestra el tooltip', async () => {
    render(
      <Tooltip content="Info adicional">
        <button type="button">Ayuda</button>
      </Tooltip>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Ayuda' })).toHaveFocus();

    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Info adicional'));
  });

  it('perder el foco oculta el tooltip', async () => {
    render(
      <Tooltip content="Info adicional">
        <button type="button">Ayuda</button>
      </Tooltip>,
    );

    await userEvent.tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument());

    await userEvent.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('el disparador queda asociado al tooltip vía aria-describedby cuando está abierto', async () => {
    render(
      <Tooltip content="Info adicional">
        <button type="button">Ayuda</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Ayuda' });
    expect(trigger).not.toHaveAttribute('aria-describedby');

    await userEvent.tab();
    await waitFor(() => {
      const describedBy = trigger.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(screen.getByRole('tooltip').id).toBe(describedBy);
    });
  });
});
