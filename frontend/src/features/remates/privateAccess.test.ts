import { describe, expect, it } from 'vitest';
import { extractRemateId } from './privateAccess';

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('extractRemateId', () => {
  it('saca el UUID de una URL de remate', () => {
    expect(extractRemateId(`https://rematar.test/remates/${UUID}`)).toBe(UUID);
  });

  it('ignora segmentos extra al final, como /sala', () => {
    expect(extractRemateId(`https://rematar.test/remates/${UUID}/sala`)).toBe(UUID);
  });

  it('tolera espacios alrededor de lo pegado y mayúsculas en el UUID', () => {
    expect(extractRemateId(`  https://rematar.test/remates/${UUID.toUpperCase()}  `)).toBe(UUID.toUpperCase());
  });

  it('devuelve null si no es una URL de remate', () => {
    expect(extractRemateId('https://rematar.test/no-es-un-remate')).toBeNull();
    expect(extractRemateId(UUID)).toBeNull();
    expect(extractRemateId('https://rematar.test/remates/123')).toBeNull();
    expect(extractRemateId('')).toBeNull();
  });
});
