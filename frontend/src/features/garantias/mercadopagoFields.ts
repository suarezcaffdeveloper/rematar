/**
 * Carga del SDK JS de Mercado Pago (vanilla, sin el wrapper `@mercadopago/sdk-react` --
 * evita sumar una dependencia npm de un paquete de terceros cuya compatibilidad con
 * React 19 no está confirmada) y montaje de los "Secure Fields" -- número de tarjeta,
 * vencimiento y código de seguridad, cada uno en un iframe propio de Mercado Pago que
 * tokeniza en el navegador. Este módulo es el ÚNICO punto del frontend que toca
 * `window.MercadoPago`; `GarantiaGate.tsx` no sabe nada de scripts ni de iframes.
 *
 * Por qué Secure Fields y no el Card Payment Brick: el formulario de la garantía tiene
 * diseño propio (la tarjeta animada del costado refleja el avance de la carga), lo que el
 * Brick -- un bloque cerrado con su propia UI -- no permite. La postura de seguridad es la
 * misma: los dígitos, el vencimiento y el CVV viven SOLO dentro de los iframes de Mercado
 * Pago; este código jamás los ve (por eso la tarjeta animada muestra apenas el BIN, la
 * marca y el estado de cada campo, nunca el valor completo), y el backend sigue rechazando
 * cualquier dato de tarjeta sin tokenizar (`GarantiaCreateRequest`). Solo el titular y el
 * documento son inputs normales -- no son datos sensibles de pago (PCI) y MP los pide
 * como parámetros de `createCardToken`.
 *
 * Verificar contra la documentación vigente de Mercado Pago (Secure Fields / "Checkout API
 * -- Integración vía Core Methods") antes de producción -- la forma exacta de los eventos
 * puede cambiar entre versiones del SDK, igual que ya se documenta del lado del backend
 * (`backend/app/modules/garantias/mercadopago_client.py`).
 */

interface MercadoPagoFieldElement {
  mount: (containerId: string) => MercadoPagoFieldElement;
  unmount: () => void;
  on: (event: string, handler: (payload: never) => void) => void;
}

interface MercadoPagoPaymentMethodsResponse {
  results?: Array<{ id: string }>;
}

interface MercadoPagoInstance {
  fields: {
    create: (field: string, options?: Record<string, unknown>) => MercadoPagoFieldElement;
    createCardToken: (params: Record<string, unknown>) => Promise<{ id?: string }>;
  };
  getPaymentMethods: (params: { bin: string }) => Promise<MercadoPagoPaymentMethodsResponse>;
  getIssuers: (params: { paymentMethodId: string; bin: string }) => Promise<Array<{ id: string | number }>>;
}

type MercadoPagoConstructor = new (
  publicKey: string,
  options?: { locale?: string },
) => MercadoPagoInstance;

declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

let sdkLoadPromise: Promise<void> | null = null;

function loadMercadoPagoSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  sdkLoadPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('No se pudo cargar el SDK de Mercado Pago.'));
    };
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

export type SecureFieldName = 'cardNumber' | 'expirationDate' | 'securityCode';

export interface SecureFieldsCallbacks {
  onFocus: (field: SecureFieldName) => void;
  onBlur: (field: SecureFieldName) => void;
  /** `valid` = el campo ya se completó y pasó la validación del SDK. */
  onValidityChange: (field: SecureFieldName, valid: boolean) => void;
  /** Primeros 6-8 dígitos (BIN) -- el único fragmento del número que el SDK expone; `null`
   * cuando el comprador lo borra. */
  onBinChange: (bin: string | null) => void;
  /** Id de medio de pago que resolvió MP para el BIN actual (`visa`, `master`, ...). */
  onPaymentMethodChange: (paymentMethodId: string | null) => void;
  onError: (error: unknown) => void;
}

export interface CardHolderData {
  cardholderName: string;
  identificationType: string;
  identificationNumber: string;
  email: string;
}

export interface MountedSecureFields {
  /** Tokeniza la tarjeta cargada y arma el `card_payment_data` que espera el backend
   * (`token`, `payment_method_id`, `issuer_id`, `installments`, `payer`). */
  createCardPaymentData: (holder: CardHolderData) => Promise<Record<string, unknown>>;
  unmount: () => void;
}

/** Convierte lo que rechaza `createCardToken` (un arreglo de `{ message, cause }`, o un
 * `Error`) en un texto mostrable. */
export function describeTokenError(error: unknown): string {
  if (Array.isArray(error)) {
    const messages = error
      .map((item) => (item && typeof item === 'object' && 'message' in item ? String(item.message) : ''))
      .filter(Boolean);
    if (messages.length) return messages.join(' ');
  }
  if (error instanceof Error) return error.message;
  return 'No se pudo validar la tarjeta. Revisá los datos e intentá de nuevo.';
}

/**
 * Monta los tres campos seguros en los contenedores indicados (deben existir en el DOM
 * antes de llamar esto).
 */
export async function mountSecureFields(params: {
  publicKey: string;
  containerIds: Record<SecureFieldName, string>;
  placeholders: Record<SecureFieldName, string>;
  callbacks: SecureFieldsCallbacks;
}): Promise<MountedSecureFields> {
  await loadMercadoPagoSdk();
  const MercadoPagoCtor = window.MercadoPago;
  if (!MercadoPagoCtor) {
    throw new Error('El SDK de Mercado Pago no expuso `window.MercadoPago` tras cargarse.');
  }
  const mp = new MercadoPagoCtor(params.publicKey, { locale: 'es-AR' });
  const { callbacks } = params;

  const names: SecureFieldName[] = ['cardNumber', 'expirationDate', 'securityCode'];
  const elements = {} as Record<SecureFieldName, MercadoPagoFieldElement>;
  for (const name of names) {
    const element = mp.fields
      .create(name, { placeholder: params.placeholders[name] })
      .mount(params.containerIds[name]);
    element.on('focus', () => callbacks.onFocus(name));
    element.on('blur', () => callbacks.onBlur(name));
    element.on('validityChange', ((event: { errorMessages?: unknown[] }) => {
      callbacks.onValidityChange(name, (event.errorMessages?.length ?? 0) === 0);
    }) as (payload: never) => void);
    elements[name] = element;
  }

  let currentBin: string | null = null;
  let resolved: { paymentMethodId: string; issuerId: string | null } | null = null;

  elements.cardNumber.on('binChange', ((event: { bin?: string | null }) => {
    const bin = event.bin && event.bin.length >= 6 ? event.bin : null;
    if (bin === currentBin) return;
    currentBin = bin;
    resolved = null;
    callbacks.onBinChange(bin);
    if (!bin) {
      callbacks.onPaymentMethodChange(null);
      return;
    }
    void resolvePaymentMethod(bin);
  }) as (payload: never) => void);

  async function resolvePaymentMethod(bin: string) {
    try {
      const methods = await mp.getPaymentMethods({ bin });
      const paymentMethodId = methods.results?.[0]?.id;
      if (bin !== currentBin || !paymentMethodId) return; // el comprador ya cambió el BIN.
      const issuers = await mp.getIssuers({ paymentMethodId, bin });
      if (bin !== currentBin) return;
      resolved = { paymentMethodId, issuerId: issuers[0] ? String(issuers[0].id) : null };
      callbacks.onPaymentMethodChange(paymentMethodId);
    } catch (error) {
      callbacks.onError(error);
    }
  }

  return {
    async createCardPaymentData(holder) {
      if (!resolved) {
        throw new Error('No se pudo identificar la tarjeta. Revisá el número e intentá de nuevo.');
      }
      const token = await mp.fields.createCardToken({
        cardholderName: holder.cardholderName,
        identificationType: holder.identificationType,
        identificationNumber: holder.identificationNumber,
      });
      if (!token.id) throw new Error('Mercado Pago no devolvió un token para la tarjeta.');
      return {
        token: token.id,
        payment_method_id: resolved.paymentMethodId,
        ...(resolved.issuerId ? { issuer_id: resolved.issuerId } : {}),
        installments: 1,
        payer: {
          email: holder.email,
          identification: { type: holder.identificationType, number: holder.identificationNumber },
        },
      };
    },
    unmount() {
      for (const name of names) elements[name].unmount();
    },
  };
}
