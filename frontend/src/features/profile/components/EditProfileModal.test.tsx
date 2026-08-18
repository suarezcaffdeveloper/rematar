import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditProfileModal } from './EditProfileModal';
import type { User } from '../../auth/types';

const { apiMocks, updateUserMock } = vi.hoisted(() => ({
  apiMocks: {
    uploadUserAvatarRequest: vi.fn(),
    updateUserAvatarRequest: vi.fn(),
  },
  updateUserMock: vi.fn(),
}));

vi.mock('../api', () => apiMocks);
vi.mock('../../auth/hooks', () => ({
  useAuthActions: () => ({ updateUser: updateUserMock }),
}));

const USER: User = {
  id: 'u1',
  email: 'martin@example.com',
  full_name: 'Martín Alvarez',
  phone: '+5491122334455',
  avatar_url: null,
  role: 'comprador',
  is_active: true,
  created_at: '2026-08-14T12:00:00Z',
};

function makeFile(name: string, type: string): File {
  return new File(['contenido'], name, { type });
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = vi.fn();
});

describe('EditProfileModal', () => {
  it('sin avatar_url, no muestra "Quitar foto"', () => {
    render(<EditProfileModal isOpen onClose={vi.fn()} user={USER} />);

    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument();
  });

  it('subir una foto válida la sube, la persiste y actualiza el store de sesión', async () => {
    apiMocks.uploadUserAvatarRequest.mockResolvedValue({ url: 'https://cdn.example.com/foto.jpg' });
    apiMocks.updateUserAvatarRequest.mockResolvedValue({ ...USER, avatar_url: 'https://cdn.example.com/foto.jpg' });

    render(<EditProfileModal isOpen onClose={vi.fn()} user={USER} />);
    await userEvent.upload(fileInput(), makeFile('foto.jpg', 'image/jpeg'));

    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({ avatar_url: 'https://cdn.example.com/foto.jpg' }),
    );
    expect(apiMocks.uploadUserAvatarRequest).toHaveBeenCalledWith(expect.objectContaining({ name: 'foto.jpg' }));
    expect(apiMocks.updateUserAvatarRequest).toHaveBeenCalledWith('https://cdn.example.com/foto.jpg');
  });

  it('un archivo con formato no admitido no se sube y muestra un error inline', async () => {
    render(<EditProfileModal isOpen onClose={vi.fn()} user={USER} />);

    await userEvent.upload(fileInput(), makeFile('doc.txt', 'text/plain'), { applyAccept: false });

    expect(screen.getByText(/no es un formato admitido/)).toBeInTheDocument();
    expect(apiMocks.uploadUserAvatarRequest).not.toHaveBeenCalled();
  });

  it('elegir un avatar predeterminado lo persiste sin pasar por la subida de archivo', async () => {
    apiMocks.updateUserAvatarRequest.mockResolvedValue({ ...USER, avatar_url: 'preset:bob' });

    render(<EditProfileModal isOpen onClose={vi.fn()} user={USER} />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar avatar Morocha' }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ avatar_url: 'preset:bob' }));
    expect(apiMocks.uploadUserAvatarRequest).not.toHaveBeenCalled();
  });

  it('"Quitar foto" persiste avatar_url en null', async () => {
    apiMocks.updateUserAvatarRequest.mockResolvedValue({ ...USER, avatar_url: null });

    render(<EditProfileModal isOpen onClose={vi.fn()} user={{ ...USER, avatar_url: 'preset:bob' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));

    await waitFor(() => expect(apiMocks.updateUserAvatarRequest).toHaveBeenCalledWith(null));
    expect(updateUserMock).toHaveBeenCalledWith({ avatar_url: null });
  });

  it('si la subida falla, muestra el error y no llama a updateUser', async () => {
    apiMocks.uploadUserAvatarRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'Formato inválido.' } } },
    });

    render(<EditProfileModal isOpen onClose={vi.fn()} user={USER} />);
    await userEvent.upload(fileInput(), makeFile('foto.jpg', 'image/jpeg'));

    await waitFor(() => expect(screen.getByText('Formato inválido.')).toBeInTheDocument());
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('"Guardar cambios" no llama a ninguna API de avatar y cierra el modal', async () => {
    const onClose = vi.fn();
    render(<EditProfileModal isOpen onClose={onClose} user={USER} />);

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiMocks.updateUserAvatarRequest).not.toHaveBeenCalled();
  });
});
