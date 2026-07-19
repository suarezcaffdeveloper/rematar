import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_SIZE_BYTES, validateImageFile } from './media';

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

describe('validateImageFile', () => {
  it('acepta JPG, PNG y WEBP dentro del tamaño permitido', () => {
    expect(validateImageFile(makeFile('a.jpg', 'image/jpeg', 1024))).toBeNull();
    expect(validateImageFile(makeFile('a.png', 'image/png', 1024))).toBeNull();
    expect(validateImageFile(makeFile('a.webp', 'image/webp', 1024))).toBeNull();
  });

  it('rechaza un formato no admitido', () => {
    const error = validateImageFile(makeFile('a.txt', 'text/plain', 1024));
    expect(error).toMatch(/formato/i);
  });

  it('rechaza un archivo que supera el tamaño máximo', () => {
    const error = validateImageFile(makeFile('grande.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES + 1));
    expect(error).toMatch(/tamaño máximo/i);
  });

  it('acepta un archivo justo en el límite de tamaño', () => {
    expect(validateImageFile(makeFile('limite.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES))).toBeNull();
  });
});
