import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropzone } from './Dropzone';

function makeFile(name: string, type: string): File {
  return new File(['contenido'], name, { type });
}

describe('Dropzone', () => {
  it('renderiza el label y el hint', () => {
    render(<Dropzone onFiles={vi.fn()} label="Subí tus fotos" hint="JPG, PNG o WEBP" />);
    expect(screen.getByText('Subí tus fotos')).toBeInTheDocument();
    expect(screen.getByText('JPG, PNG o WEBP')).toBeInTheDocument();
  });

  it('llama a onFiles al elegir un archivo con el input', async () => {
    const onFiles = vi.fn();
    render(<Dropzone onFiles={onFiles} />);
    const file = makeFile('foto.jpg', 'image/jpeg');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('llama a onFiles al soltar archivos (drop)', () => {
    const onFiles = vi.fn();
    render(<Dropzone onFiles={onFiles} />);
    const file = makeFile('foto.png', 'image/png');

    const dropArea = screen.getByRole('button');
    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    dropArea.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer }),
    );

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('no llama a onFiles si está deshabilitado', () => {
    const onFiles = vi.fn();
    render(<Dropzone onFiles={onFiles} disabled />);
    const file = makeFile('foto.jpg', 'image/jpeg');

    const dropArea = screen.getByRole('button');
    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    dropArea.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer }),
    );

    expect(onFiles).not.toHaveBeenCalled();
  });
});
