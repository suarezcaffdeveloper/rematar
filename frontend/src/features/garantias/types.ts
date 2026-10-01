/**
 * Tipos de la Garantía Económica (bloqueo de tarjeta vía Mercado Pago) --
 * `backend/app/modules/garantias/schemas.py`.
 */

/** `GarantiaStatus` del backend (`garantias/models.py`) -- los mismos seis valores, ni
 * uno más. `pending_authorization`/`failed`/`expired`/`released`/`captured` se tratan
 * todos igual que "sin garantía activa" del lado del gate (`PlaceBidButton`): el único
 * estado que habilita ofertar es `active`. */
export type GarantiaStatus =
  | 'pending_authorization'
  | 'active'
  | 'captured'
  | 'released'
  | 'expired'
  | 'failed';

/** `GarantiaRead` -- nunca expone `mp_payment_id`/`mp_status` (identificadores/estado
 * crudo del proveedor), ver el docstring de ese schema del lado del backend. */
export interface Garantia {
  id: string;
  remate_id: string;
  status: GarantiaStatus;
  amount: string;
  currency: string;
  expires_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

/** Tal cual lo arma `mercadopagoFields.ts` con los Secure Fields de Mercado Pago en el
 * navegador (`token`, `payment_method_id`, `issuer_id`, `installments`, `payer`). Este
 * frontend nunca ve ni valida un número de tarjeta crudo, los campos seguros lo tokenizan
 * dentro de sus propios iframes. */
export type CardPaymentData = Record<string, unknown>;
