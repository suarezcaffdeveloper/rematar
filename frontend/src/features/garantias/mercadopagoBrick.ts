/**
 * Carga del SDK JS de Mercado Pago (vanilla, sin el wrapper `@mercadopago/sdk-react` --
 * evita sumar una dependencia npm de un paquete de terceros cuya compatibilidad con
 * React 19 no está confirmada) y montaje del Card Payment Brick -- el formulario de
 * tarjeta que Mercado Pago renderiza dentro de un iframe propio y tokeniza en el
 * navegador. Este módulo es el ÚNICO punto del frontend que toca `window.MercadoPago`;
 * `GarantiaGate.tsx` no sabe nada de scripts ni de iframes, solo le pasa un
 * `containerId` y recibe `cardFormData` ya tokenizado por `onSubmit`.
 *
 * Verificar contra la documentación vigente de Mercado Pago (Card Payment Brick) antes
 * de producción -- la forma exacta de `settings`/`callbacks` puede cambiar entre
 * versiones del SDK, igual que ya se documenta del lado del backend
 * (`backend/app/modules/garantias/mercadopago_client.py`).
 */

interface MercadoPagoBricksController {
  unmount: () => void;
}

interface MercadoPagoBricksBuilder {
  create: (
    brickType: string,
    containerId: string,
    settings: Record<string, unknown>,
  ) => Promise<MercadoPagoBricksController>;
}

interface MercadoPagoInstance {
  bricks: () => MercadoPagoBricksBuilder;
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

export interface CardPaymentBrickCallbacks {
  onReady?: () => void;
  /** Puede lanzar/rechazar -- `GarantiaGate` decide qué mostrar ante un error acá
   * (mismo criterio que cualquier `onSubmit` de formulario del proyecto). */
  onSubmit: (cardFormData: Record<string, unknown>) => Promise<void>;
  onError?: (error: unknown) => void;
}

export interface MountedCardPaymentBrick {
  unmount: () => void;
}

/**
 * Monta el Card Payment Brick dentro del elemento con id `containerId` (debe existir en
 * el DOM antes de llamar esto). `amount` es el monto de la garantía a autorizar --
 * Mercado Pago lo muestra en su propio formulario, informado al comprador antes de
 * cargar la tarjeta.
 */
export async function mountCardPaymentBrick(params: {
  containerId: string;
  publicKey: string;
  amount: number;
  callbacks: CardPaymentBrickCallbacks;
}): Promise<MountedCardPaymentBrick> {
  await loadMercadoPagoSdk();
  const MercadoPagoCtor = window.MercadoPago;
  if (!MercadoPagoCtor) {
    throw new Error('El SDK de Mercado Pago no expuso `window.MercadoPago` tras cargarse.');
  }

  const mp = new MercadoPagoCtor(params.publicKey, { locale: 'es-AR' });
  const controller = await mp.bricks().create('cardPayment', params.containerId, {
    initialization: { amount: params.amount },
    callbacks: {
      // El SDK de Mercado Pago exige que `onReady`/`onError` sean funciones reales --
      // pasar `undefined` (cuando `GarantiaGate` no necesita reaccionar a alguno de los
      // dos) hace fallar `create()` con "Callbacks onReady and/or onError are
      // required.". No-ops acá, nunca `undefined`.
      onReady: params.callbacks.onReady ?? (() => {}),
      onSubmit: (cardFormData: Record<string, unknown>) => params.callbacks.onSubmit(cardFormData),
      onError: params.callbacks.onError ?? (() => {}),
    },
  });

  return { unmount: () => controller.unmount() };
}
