import { describe, expect, it } from 'vitest';
import { AlertTriangle, Bell, PackageCheck } from 'lucide-react';
import { notificationIcon } from './labels';

describe('notificationIcon', () => {
  it('mapea tipos de postauction al ícono de paquete', () => {
    expect(notificationIcon('postauction.case_created')).toBe(PackageCheck);
    expect(notificationIcon('postauction.status_changed')).toBe(PackageCheck);
  });

  it('mapea tipos de moderación al ícono de alerta', () => {
    expect(notificationIcon('moderacion.umbral_ofertas_invalidas_superado')).toBe(AlertTriangle);
  });

  it('un tipo desconocido cae en el ícono genérico', () => {
    expect(notificationIcon('algo.que.no.existe.todavia')).toBe(Bell);
  });
});
