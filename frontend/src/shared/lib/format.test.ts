import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDateTime } from './format';

describe('formatDateTime', () => {
  it('formatea un ISO 8601 con fecha y hora', () => {
    const result = formatDateTime('2026-08-01T14:30:00Z');
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/ago/i);
  });
});

describe('formatCurrency', () => {
  it('formatea un monto en ARS', () => {
    const result = formatCurrency('1000.00', 'ARS');
    expect(result).toMatch(/1[.,]000/);
    expect(result).toMatch(/\$|ARS/);
  });

  it('formatea un monto en USD distinto de ARS', () => {
    const arsResult = formatCurrency('1000.00', 'ARS');
    const usdResult = formatCurrency('1000.00', 'USD');
    expect(usdResult).not.toBe(arsResult);
  });

  it('preserva la precisión de un monto con decimales', () => {
    const result = formatCurrency('1234.56', 'ARS');
    expect(result).toMatch(/1[.,]?234[.,]56|1234[.,]56/);
  });

  it('ante un código de moneda inválido, no rompe -- cae a un formato de respaldo', () => {
    const result = formatCurrency('1000.00', 'XXX_NO_VALIDO');
    expect(result).toBe('1000.00 XXX_NO_VALIDO');
  });
});
