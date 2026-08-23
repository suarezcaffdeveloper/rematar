import { describe, expect, it } from 'vitest';
import { notificationHref } from './routing';
import type { Notification } from './types';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    created_at: '2026-07-23T10:00:00Z',
    type: 'postauction.case_created',
    title: '',
    message: '',
    resource_type: null,
    resource_id: null,
    remate_id: null,
    read_at: null,
    ...overrides,
  };
}

describe('notificationHref', () => {
  it('lote ganado por un comprador va a "Mis compras" (lista), no al detalle', () => {
    const notification = makeNotification({
      type: 'postauction.case_created',
      resource_type: 'postauction_case',
      resource_id: 'case-1',
      remate_id: 'remate-1',
    });

    expect(notificationHref(notification, 'comprador')).toBe('/mis-compras');
  });

  it('lote adjudicado, del lado de la empresa dueña del remate (ADR-047), va al detalle de esa venta puntual', () => {
    const notification = makeNotification({
      type: 'postauction.case_created',
      resource_type: 'postauction_case',
      resource_id: 'case-1',
      remate_id: 'remate-1',
    });

    expect(notificationHref(notification, 'empresa')).toBe('/ventas-adjudicadas/case-1');
  });

  it('actualización de estado de una compra va al detalle de esa compra puntual', () => {
    const notification = makeNotification({
      type: 'postauction.status_changed',
      resource_type: 'postauction_case',
      resource_id: 'case-1',
      remate_id: 'remate-1',
    });

    expect(notificationHref(notification, 'comprador')).toBe('/mis-compras/case-1');
  });

  it('un evento de remate general (sin recurso propio) cae al detalle del remate', () => {
    const notification = makeNotification({
      type: 'moderacion.umbral_ofertas_invalidas_superado',
      resource_type: 'remate',
      resource_id: 'remate-1',
      remate_id: 'remate-1',
    });

    expect(notificationHref(notification, 'rematador')).toBe('/remates/remate-1');
  });

  it('sin ningún recurso asociado, no hay destino de navegación', () => {
    const notification = makeNotification({ type: 'algo.sin.recurso' });

    expect(notificationHref(notification, 'comprador')).toBeNull();
  });
});
