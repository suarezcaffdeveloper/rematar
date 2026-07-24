import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastViewport } from './ToastViewport';
import { useToastStore } from './toastStore';

afterEach(() => {
  act(() => {
    useToastStore.setState({ toasts: [] });
  });
});

describe('ToastViewport', () => {
  it('el contenedor vive siempre en el DOM como región aria-live, incluso sin toasts', () => {
    render(<ToastViewport />);
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).toBeInTheDocument();
  });

  it('push agrega un toast visible con el mensaje', async () => {
    render(<ToastViewport />);

    act(() => {
      useToastStore.getState().push('success', 'Guardado con éxito.');
    });

    expect(await screen.findByText('Guardado con éxito.')).toBeInTheDocument();
  });

  it('acepta la variante warning', async () => {
    render(<ToastViewport />);

    act(() => {
      useToastStore.getState().push('warning', 'Revisá este dato.');
    });

    expect(await screen.findByText('Revisá este dato.')).toBeInTheDocument();
  });

  it('cerrar manualmente termina quitando el toast del store', async () => {
    render(<ToastViewport />);

    act(() => {
      useToastStore.getState().push('info', 'Un aviso.');
    });
    expect(await screen.findByText('Un aviso.')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Cerrar aviso' }).click();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(0));
  });
});
