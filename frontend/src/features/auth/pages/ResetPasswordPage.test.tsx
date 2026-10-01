import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

const validateMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  validateResetPasswordTokenRequest: validateMock,
  resetPasswordRequest: resetMock,
}));

function renderPage(url = '/reset-password?token=abc') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  it('con un link vencido avisa y ofrece pedir uno nuevo', async () => {
    validateMock.mockRejectedValueOnce(new Error('expired'));
    renderPage();

    expect(await screen.findByText(/ya no es válido/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pedir un link nuevo/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('sin token en la URL lo trata como link inválido sin consultar al backend', async () => {
    renderPage('/reset-password');

    expect(await screen.findByText(/ya no es válido/i)).toBeInTheDocument();
    expect(validateMock).not.toHaveBeenCalledWith({ token: '' });
  });

  it('con un link válido muestra el formulario y no envía si las contraseñas no coinciden', async () => {
    validateMock.mockResolvedValueOnce(undefined);
    renderPage();

    expect(await screen.findByRole('heading', { name: /elegí una contraseña nueva/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña nueva/i), { target: { value: 'otra-password' } });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/las contraseñas no coinciden/i));
    expect(resetMock).not.toHaveBeenCalled();
  });
});
