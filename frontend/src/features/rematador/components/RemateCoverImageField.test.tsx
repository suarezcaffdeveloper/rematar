import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemateCoverImageField } from './RemateCoverImageField';

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    uploadRemateCoverImageRequest: vi.fn(),
  },
}));

vi.mock('../../remates/api', () => apiMocks);

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

describe('RemateCoverImageField', () => {
  it('sin imagen, muestra el selector de archivo (Dropzone), no una preview', () => {
    render(<RemateCoverImageField value="" onChange={vi.fn()} />);

    expect(screen.getByText('Arrastrá una imagen acá o hacé clic para elegirla')).toBeInTheDocument();
    expect(screen.queryByAltText('Vista previa de la portada')).not.toBeInTheDocument();
  });

  it('con un cover_image_url ya cargado (modo edición), muestra la preview en vez del selector', () => {
    render(<RemateCoverImageField value="https://example.com/portada.jpg" onChange={vi.fn()} />);

    expect(screen.getByAltText('Vista previa de la portada')).toHaveAttribute(
      'src',
      'https://example.com/portada.jpg',
    );
    expect(screen.queryByText('Arrastrá una imagen acá o hacé clic para elegirla')).not.toBeInTheDocument();
  });

  it('elegir un archivo válido lo sube y llama a onChange con la URL resultante', async () => {
    apiMocks.uploadRemateCoverImageRequest.mockResolvedValue({ url: 'https://cdn.example.com/nueva.jpg' });
    const onChange = vi.fn();
    render(<RemateCoverImageField value="" onChange={onChange} />);

    await userEvent.upload(fileInput(), makeFile('portada.jpg', 'image/jpeg'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.example.com/nueva.jpg'));
    expect(apiMocks.uploadRemateCoverImageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'portada.jpg' }),
      expect.any(Function),
    );
  });

  it('un archivo con formato no admitido no se sube y muestra un error inline', async () => {
    render(<RemateCoverImageField value="" onChange={vi.fn()} />);

    await userEvent.upload(fileInput(), makeFile('doc.txt', 'text/plain'), { applyAccept: false });

    expect(screen.getByText(/no es un formato admitido/)).toBeInTheDocument();
    expect(apiMocks.uploadRemateCoverImageRequest).not.toHaveBeenCalled();
  });

  it('si la subida falla, muestra el error del backend y no llama a onChange', async () => {
    apiMocks.uploadRemateCoverImageRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'Formato inválido.' } } },
    });
    const onChange = vi.fn();
    render(<RemateCoverImageField value="" onChange={onChange} />);

    await userEvent.upload(fileInput(), makeFile('portada.jpg', 'image/jpeg'));

    await waitFor(() => expect(screen.getByText('Formato inválido.')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"Quitar imagen de portada" limpia la preview y llama a onChange con string vacío', async () => {
    const onChange = vi.fn();
    render(<RemateCoverImageField value="https://example.com/portada.jpg" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar imagen de portada' }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
