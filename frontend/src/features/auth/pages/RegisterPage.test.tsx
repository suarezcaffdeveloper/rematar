import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';

const registerRequestMock = vi.hoisted(() => vi.fn());
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  registerRequest: registerRequestMock,
}));

function fillValidForm(role: 'comprador' | 'empresa' | 'rematador' = 'comprador') {
  fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Juan Pérez' } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'juan@example.com' } });
  fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+5491122334455' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'password123' } });
  if (role !== 'comprador') {
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(role, 'i') }));
  }
}

describe('RegisterPage', () => {
  it('muestra el título, los campos del formulario y las tres opciones de rol', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /crear una cuenta/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /comprador/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /empresa/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /rematador/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login');
  });

  it('avisa que empresa/rematador quedan pendientes de aprobación antes de enviar', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/pendiente de aprobación/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /empresa/i }));
    expect(screen.getByText(/pendiente de aprobación/i)).toBeInTheDocument();
  });

  it('empresa/rematador (ADR-nuevo, aprobación admin): tras registrarse sin quedar activo, muestra el estado pendiente en vez de navegar', async () => {
    registerRequestMock.mockResolvedValueOnce({
      id: 'user-1',
      email: 'juan@example.com',
      full_name: 'Juan Pérez',
      phone: '+5491122334455',
      avatar_url: null,
      role: 'empresa',
      is_active: false,
      created_at: '2026-08-21T00:00:00Z',
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fillValidForm('empresa');
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /cuenta creada/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/quedó pendiente de aprobación/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
  });

  it('muestra un error y no envía el formulario si las contraseñas no coinciden', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/nombre completo/i), {
      target: { value: 'Juan Pérez' },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: 'juan@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teléfono/i), {
      target: { value: '+5491122334455' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), {
      target: { value: 'otra-password' },
    });

    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/las contraseñas no coinciden/i);
  });
});
