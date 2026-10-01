import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../auth/store';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Spinner } from '../../../shared/components/Spinner';
import { env } from '../../../shared/config/env';
import { formatCurrency } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { createGarantiaRequest, fetchMyGarantiaRequest } from '../api';
import {
  describeTokenError,
  mountSecureFields,
  type MountedSecureFields,
  type SecureFieldName,
} from '../mercadopagoFields';
import type { Garantia } from '../types';
import { EMPTY_CARD_VIEW, GarantiaCardStage, type CardView } from './GarantiaCardStage';
import { GarantiaDialog } from './GarantiaDialog';

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 12; // ~30s -- tiempo de sobra para que MP confirme una tarjeta.

export interface GarantiaModalProps {
  /** Controla la visibilidad desde afuera (el botón "Construir garantía" de
   * `PlaceBidButton` es quien la abre -- ya no hay un banner propio con botón como
   * tenía el `GarantiaGate` original). */
  isOpen: boolean;
  onClose: () => void;
  remateId: string;
  /** Monto exigido (`RemateSettings.guarantee_amount`, ya validado no-nulo por quien
   * renderiza este componente -- ver `SalaPage`). */
  amount: string;
  currency: string;
  /** La garantía quedó resuelta (autorizada, rechazada, etc.) -- quien compone
   * (`SalaPage`, vía `useGarantiaStatus`) la registra para recalcular
   * `hasRequiredGuarantee` y volver a mostrar el botón "Ofertar" si quedó `active`. */
  onResolved: (garantia: Garantia) => void;
}

/**
 * Diálogo de la garantía económica (consentimiento informado -> formulario de tarjeta
 * con Secure Fields de Mercado Pago -> polling hasta que se resuelve). Es el contenido
 * del `GarantiaGate` original, extraído a un componente controlado desde afuera
 * (`isOpen`): el gate visual pasó a vivir en el propio botón de ofertar
 * (`PlaceBidButton` muestra "Construir garantía" en vez de "Ofertar" cuando falta la
 * garantía, y la card amarilla que lo anunciaba arriba de la sala ya no existe).
 *
 * El backend es la única defensa real (`AuctionEngine.place_bid`) -- esto sigue siendo
 * UX, el mismo flujo de siempre, solo abierto desde otro lugar.
 */
export function GarantiaModal({ isOpen, onClose, remateId, amount, currency, onResolved }: GarantiaModalProps) {
  const [hasConsented, setHasConsented] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const closeSelf = useCallback(() => onClose(), [onClose]);

  // Cada apertura arranca el flujo de cero (consentimiento, sin éxito previo) -- los
  // Secure Fields se desmontan con el diálogo (`GarantiaCardStage`/este efecto de
  // limpieza) y se vuelven a montar en la próxima apertura.
  useEffect(() => {
    if (isOpen) {
      setHasConsented(false);
      setIsSuccess(false);
    }
  }, [isOpen]);

  function handleResolved(resolved: Garantia) {
    onResolved(resolved);
    if (resolved.status === 'active') {
      useToastStore.getState().push('success', 'Tu garantía quedó activa. Ya podés ofertar.');
      // El diálogo NO se corta de golpe: `isSuccess` dispara la secuencia de salida de
      // `GarantiaCardStage` (tilde, la billetera reaparece, guarda la tarjeta y se van
      // hacia abajo), que al arrancar su tramo final llama a `onClose` -- así la
      // billetera y el diálogo se retiran juntos.
      setIsSuccess(true);
    }
  }

  return (
    <GarantiaDialog isOpen={isOpen} onClose={closeSelf} title="Garantía económica" slowExit={isSuccess}>
      <GarantiaDialogContent
        isOpen={isOpen}
        remateId={remateId}
        amount={amount}
        currency={currency}
        hasConsented={hasConsented}
        isSuccess={isSuccess}
        onConsent={() => setHasConsented(true)}
        onCancel={closeSelf}
        onResolved={handleResolved}
      />
    </GarantiaDialog>
  );
}

const PANEL_TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

interface GarantiaDialogContentProps {
  isOpen: boolean;
  remateId: string;
  amount: string;
  currency: string;
  hasConsented: boolean;
  isSuccess: boolean;
  onConsent: () => void;
  onCancel: () => void;
  onResolved: (garantia: Garantia) => void;
}

function GarantiaDialogContent({
  isOpen,
  remateId,
  amount,
  currency,
  hasConsented,
  isSuccess,
  onConsent,
  onCancel,
  onResolved,
}: GarantiaDialogContentProps) {
  const reduceMotion = useReducedMotion();
  // Vive acá (y no dentro del formulario) para que la tarjeta animada del costado y el
  // formulario compartan estado sin que el resto del diálogo lo sepa; se descarta junto
  // con él.
  const [view, setView] = useState<CardView>(EMPTY_CARD_VIEW);
  const patchView = useCallback((patch: Partial<CardView>) => setView((v) => ({ ...v, ...patch })), []);

  // Ya no hay un paso "success" separado: una vez que se aprueba, `CardFormStep` sigue
  // montado y es quien anima la transición (el agujero negro que se traga el formulario y
  // el tilde que sale de él) -- así no compite con el fade de `PANEL_TRANSITION` de acá
  // abajo, que solo se usa para pasar de "consent" a "card".
  const step = hasConsented ? 'card' : 'consent';

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="hidden md:block">
        <GarantiaCardStage
          isOpen={isOpen}
          view={view}
          revealCard={hasConsented}
          isSuccess={isSuccess}
          onExitStart={onCancel}
        />
      </div>
      <div className="px-6 py-10 sm:px-10">
        <p className="text-xs font-medium uppercase tracking-[.14em] text-brand-600">Garantía económica</p>
        <motion.div
          key={step}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={PANEL_TRANSITION}
        >
          {step === 'consent' && (
            <ConsentStep amount={amount} currency={currency} onConsent={onConsent} onCancel={onCancel} />
          )}
          {step === 'card' && (
            <CardFormStep
              remateId={remateId}
              amount={amount}
              currency={currency}
              isSuccess={isSuccess}
              onViewChange={patchView}
              onResolved={onResolved}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function ConsentStep({
  amount,
  currency,
  onConsent,
  onCancel,
}: {
  amount: string;
  currency: string;
  onConsent: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink">
        Antes de ofertar, constituí tu garantía
      </h2>
      <p className="text-sm text-ink">
        Para ofertar en este remate, vamos a retener{' '}
        <strong className="font-semibold">{formatCurrency(amount, currency)}</strong> en tu
        tarjeta de crédito como garantía.
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-muted">
        <li>No es un cobro: es un bloqueo temporal (preautorización) en tu tarjeta.</li>
        <li>Si no ganás ningún lote, se libera automáticamente al cerrar el remate.</li>
        <li>Si ganás un lote, este monto se descuenta del precio final.</li>
        <li>Si ganás un lote y no ejecutas el pago, se te cobrará el monto bloqueado como parte del precio final.</li>
      </ul>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onConsent}>Entiendo, continuar</Button>
      </div>
    </div>
  );
}

const CONTAINER_BASE =
  'h-11 w-full overflow-hidden rounded-lg border bg-white px-3 shadow-sm transition-colors';

function SecureFieldBox({ id, label, focused }: { id: string; label: string; focused: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div
        id={id}
        className={clsx(
          CONTAINER_BASE,
          focused ? 'border-brand-500 ring-2 ring-brand-500' : 'border-slate-300',
        )}
      />
    </div>
  );
}

/** Uno por cada bloque del formulario que se "succiona" hacia el centro cuando la
 * garantía queda aprobada -- ver `collapsePhase` más abajo. */
type CollapseKey = 'heading' | 'number' | 'holder' | 'exp' | 'cvv' | 'dni' | 'email' | 'button' | 'disclaimer';

const COLLAPSE_KEYS: CollapseKey[] = ['heading', 'number', 'holder', 'exp', 'cvv', 'dni', 'email', 'button', 'disclaimer'];

// Rotación (grados) y demora (segundos) de cada bloque al converger hacia el centro: el
// signo alterna para que la convergencia se sienta como un remolino y no como un desfile
// en fila, y la demora creciente hace que los de más abajo salgan tras los de más arriba.
const COLLAPSE_ROTATION: Record<CollapseKey, number> = {
  heading: -160,
  number: -140,
  holder: -80,
  exp: 150,
  cvv: -150,
  dni: 120,
  email: -120,
  button: 170,
  disclaimer: 190,
};
const COLLAPSE_DELAY: Record<CollapseKey, number> = {
  heading: 0,
  number: 0.02,
  holder: 0.045,
  exp: 0.065,
  cvv: 0.075,
  dni: 0.09,
  email: 0.1,
  button: 0.115,
  disclaimer: 0.13,
};
const COLLAPSE_DURATION = 0.55;
const COLLAPSE_EASE = [0.55, 0, 1, 0.45] as const;
const POP_EASE = [0.34, 1.56, 0.64, 1] as const;
const TEXT_EASE = [0.22, 1, 0.36, 1] as const;
// Cuánto se espera, desde que se aprueba, antes de mostrar el tilde: el último campo
// arranca a los 130ms y tarda 550ms en desaparecer del todo (~680ms) -- 720ms le da un
// margen chico. Ver `GarantiaCardStage.SUCCESS_HOLD_MS`: le da tiempo de sobra a esta
// secuencia completa (~1.36s hasta que el texto termina de aparecer) antes de que la
// billetera arranque a irse, para que todo se vaya junto como pidió el usuario.
const CHECK_DELAY_MS = 720;

function CardFormStep({
  remateId,
  amount,
  currency,
  isSuccess,
  onViewChange,
  onResolved,
}: {
  remateId: string;
  amount: string;
  currency: string;
  isSuccess: boolean;
  onViewChange: (patch: Partial<CardView>) => void;
  onResolved: (garantia: Garantia) => void;
}) {
  const baseId = useId().replace(/:/g, '');
  const containerIds: Record<SecureFieldName, string> = {
    cardNumber: `${baseId}-number`,
    expirationDate: `${baseId}-exp`,
    securityCode: `${baseId}-cvv`,
  };
  const accountEmail = useAuthStore((state) => state.user?.email ?? '');

  const [holder, setHolder] = useState('');
  const [dni, setDni] = useState('');
  const [focusedField, setFocusedField] = useState<SecureFieldName | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fieldsRef = useRef<MountedSecureFields | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ver el efecto de más abajo que monta los campos -- este ref sobrevive al doble
  // montaje/desmontaje que `React.StrictMode` simula en desarrollo, a diferencia de
  // cualquier variable declarada dentro del efecto.
  const hasStartedMountRef = useRef(false);
  const isUnmountedRef = useRef(false);
  const reduceMotion = useReducedMotion() ?? false;

  // Animación de aprobación: todo el formulario converge hacia el centro (el "agujero
  // negro") y de ahí sale el circulito con el tilde. `stackRef` mide el centro del panel;
  // `elRefs` mide, campo por campo, cuánto tiene que viajar cada uno para llegar justo
  // ahí -- así el efecto se adapta solo al ancho real del panel y a lo que esté
  // renderizado (por ejemplo si había un `Alert` de error ocupando espacio), en vez de
  // usar distancias fijas calculadas a mano para un layout que después puede cambiar.
  const [collapsePhase, setCollapsePhase] = useState<'idle' | 'collapsing' | 'check'>('idle');
  const [collapseTargets, setCollapseTargets] = useState<Partial<Record<CollapseKey, { x: number; y: number }>>>({});
  const stackRef = useRef<HTMLFormElement>(null);
  const elRefs = useRef<Partial<Record<CollapseKey, HTMLElement | null>>>({});
  const registerCollapseRef = (key: CollapseKey) => (el: HTMLElement | null) => {
    elRefs.current[key] = el;
  };

  useEffect(() => {
    if (!isSuccess) return;
    if (reduceMotion) {
      setCollapsePhase('check');
      return;
    }
    const container = stackRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const cx = containerRect.left + containerRect.width / 2;
      const cy = containerRect.top + containerRect.height / 2;
      const targets: Partial<Record<CollapseKey, { x: number; y: number }>> = {};
      COLLAPSE_KEYS.forEach((key) => {
        const el = elRefs.current[key];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        targets[key] = { x: cx - (rect.left + rect.width / 2), y: cy - (rect.top + rect.height / 2) };
      });
      setCollapseTargets(targets);
    }
    setCollapsePhase('collapsing');
    const timer = setTimeout(() => setCollapsePhase('check'), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // La medición tiene que pasar una sola vez, en el instante exacto en que se aprueba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, reduceMotion]);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      fieldsRef.current?.unmount();
      fieldsRef.current = null;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!env.mercadopagoPublicKey) return;
    // `React.StrictMode` (desarrollo) simula un montaje -> desmontaje -> montaje apenas se
    // monta el componente, disparando este efecto dos veces casi sincrónicamente.
    // `mountSecureFields` es async (carga el SDK, crea los iframes) -- para cuando la
    // limpieza del primer disparo corre, esa llamada todavía no resolvió, así que un flag
    // `cancelled` declarado adentro del efecto no alcanza para evitar que el SEGUNDO
    // disparo arranque una SEGUNDA creación de campos sobre los mismos contenedores en
    // paralelo (dos SDK pisándose los nodos del mismo `<div>`, el "removeChild" que ya se
    // vio con el Brick). `hasStartedMountRef` sí sobrevive (es un ref): el segundo
    // disparo lo ve en `true` y no vuelve a montar. El desmontaje real lo resuelve el
    // efecto de arriba (`fieldsRef`); si el diálogo se cierra antes de que la promesa
    // resuelva, el `.then` de acá abajo desmonta al vuelo.
    if (hasStartedMountRef.current) return;
    hasStartedMountRef.current = true;

    mountSecureFields({
      publicKey: env.mercadopagoPublicKey,
      containerIds,
      placeholders: { cardNumber: '1234 5678 9012 3456', expirationDate: 'MM/AA', securityCode: '123' },
      callbacks: {
        onFocus: (field) => {
          setFocusedField(field);
          onViewChange({ focus: field });
        },
        onBlur: (field) => {
          setFocusedField((current) => (current === field ? null : current));
          onViewChange({ focus: null });
        },
        onValidityChange: (field, valid) => {
          if (field === 'cardNumber') onViewChange({ numberValid: valid });
          else if (field === 'expirationDate') onViewChange({ expirationValid: valid });
          else onViewChange({ securityCodeValid: valid });
        },
        onBinChange: (bin) => onViewChange({ bin }),
        onPaymentMethodChange: (paymentMethodId) => onViewChange({ paymentMethodId }),
        onError: (error) => setSubmitError(describeTokenError(error)),
      },
    })
      .then((mounted) => {
        if (isUnmountedRef.current) {
          mounted.unmount();
          return;
        }
        fieldsRef.current = mounted;
      })
      .catch((err: unknown) => {
        hasStartedMountRef.current = false;
        setSubmitError(err instanceof Error ? err.message : 'No se pudo cargar el formulario de tarjeta.');
      });
    // `containerIds`/`onViewChange` son estables durante la vida de este paso (derivan de
    // un `useId` y de un `useCallback` sin dependencias); re-montar los campos en cada
    // render los reiniciaría innecesariamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollUntilResolved(attempt: number) {
    const current = await fetchMyGarantiaRequest(remateId);
    if (!current || current.status === 'pending_authorization') {
      if (attempt >= POLL_MAX_ATTEMPTS) {
        setIsProcessing(false);
        setSubmitError(
          'Mercado Pago todavía está procesando la autorización. Volvé a intentar en unos minutos.',
        );
        return;
      }
      pollTimeoutRef.current = setTimeout(() => void pollUntilResolved(attempt + 1), POLL_INTERVAL_MS);
      return;
    }
    setIsProcessing(false);
    onResolved(current);
  }

  const isDniValid = /^\d{7,8}$/.test(dni);
  const isHolderValid = holder.trim().length >= 3;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!fieldsRef.current || !isHolderValid || !isDniValid) return;
    setSubmitError(null);
    setIsProcessing(true);

    let cardPaymentData: Record<string, unknown>;
    try {
      cardPaymentData = await fieldsRef.current.createCardPaymentData({
        cardholderName: holder.trim(),
        identificationType: 'DNI',
        identificationNumber: dni,
        email: accountEmail,
      });
    } catch (err) {
      setIsProcessing(false);
      setSubmitError(describeTokenError(err));
      return;
    }

    try {
      const result = await createGarantiaRequest(remateId, cardPaymentData);
      if (result.status === 'pending_authorization') {
        void pollUntilResolved(1);
        return;
      }
      setIsProcessing(false);
      if (result.status === 'failed') {
        setSubmitError(result.failure_reason ?? 'Mercado Pago rechazó la tarjeta.');
      }
      onResolved(result);
    } catch (err) {
      setIsProcessing(false);
      setSubmitError(normalizeApiError(err).message);
    }
  }

  if (!env.mercadopagoPublicKey) {
    return (
      <Alert variant="warning" className="mt-3">
        La carga de tarjeta no está disponible en este entorno todavía. Contactá al
        rematador si necesitás ofertar en este remate.
      </Alert>
    );
  }

  // Estado colapsado (blanco de la convergencia) que comparten todos los campos; la
  // posición de cada uno (`collapseTargets`) se mide recién al aprobar (efecto de más
  // arriba), así que antes de eso cae al origen y no se nota.
  function collapseAnimate(key: CollapseKey) {
    if (collapsePhase === 'idle') {
      return { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, filter: 'blur(0px)' };
    }
    const target = collapseTargets[key];
    return {
      x: target?.x ?? 0,
      y: target?.y ?? 0,
      scale: 0.14,
      rotate: COLLAPSE_ROTATION[key],
      opacity: 0,
      filter: 'blur(1px)',
    };
  }
  function collapseTransition(key: CollapseKey) {
    return {
      duration: reduceMotion ? 0 : COLLAPSE_DURATION,
      delay: reduceMotion ? 0 : COLLAPSE_DELAY[key],
      ease: COLLAPSE_EASE,
    };
  }

  return (
    <form
      ref={stackRef}
      onSubmit={handleSubmit}
      noValidate
      className={clsx('relative mt-3 flex flex-col gap-4', collapsePhase !== 'idle' && 'pointer-events-none')}
    >
      <motion.div ref={registerCollapseRef('heading')} animate={collapseAnimate('heading')} transition={collapseTransition('heading')}>
        <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink">
          Agregá tu tarjeta para poder ofertar
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Bloqueamos temporalmente {formatCurrency(amount, currency)} como garantía. No se realiza ningún
          cobro.
        </p>
      </motion.div>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <motion.div ref={registerCollapseRef('number')} animate={collapseAnimate('number')} transition={collapseTransition('number')}>
        <SecureFieldBox id={containerIds.cardNumber} label="Número de tarjeta" focused={focusedField === 'cardNumber'} />
      </motion.div>
      <motion.div ref={registerCollapseRef('holder')} animate={collapseAnimate('holder')} transition={collapseTransition('holder')}>
        <Input
          label="Titular"
          autoComplete="cc-name"
          placeholder="Como figura en la tarjeta"
          value={holder}
          onChange={(e) => {
            const next = e.target.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, '').slice(0, 26);
            setHolder(next);
            onViewChange({ holder: next });
          }}
          onFocus={() => onViewChange({ focus: 'holder' })}
          onBlur={() => onViewChange({ focus: null })}
        />
      </motion.div>
      <div className="grid grid-cols-2 gap-4">
        <motion.div ref={registerCollapseRef('exp')} animate={collapseAnimate('exp')} transition={collapseTransition('exp')}>
          <SecureFieldBox id={containerIds.expirationDate} label="Vencimiento" focused={focusedField === 'expirationDate'} />
        </motion.div>
        <motion.div ref={registerCollapseRef('cvv')} animate={collapseAnimate('cvv')} transition={collapseTransition('cvv')}>
          <SecureFieldBox id={containerIds.securityCode} label="Código de seguridad" focused={focusedField === 'securityCode'} />
        </motion.div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <motion.div ref={registerCollapseRef('dni')} animate={collapseAnimate('dni')} transition={collapseTransition('dni')}>
          <Input
            label="DNI del titular"
            inputMode="numeric"
            placeholder="Sin puntos"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
        </motion.div>
        <motion.div ref={registerCollapseRef('email')} animate={collapseAnimate('email')} transition={collapseTransition('email')}>
          <Input label="Email de tu cuenta" type="email" value={accountEmail} readOnly disabled={!accountEmail} />
        </motion.div>
      </div>

      <motion.div ref={registerCollapseRef('button')} animate={collapseAnimate('button')} transition={collapseTransition('button')}>
        <Button type="submit" isLoading={isProcessing} disabled={isProcessing || !isHolderValid || !isDniValid} className="mt-1 py-3">
          Confirmar garantía
        </Button>
      </motion.div>
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner size="sm" />
          Procesando con Mercado Pago...
        </div>
      )}
      <motion.p
        ref={registerCollapseRef('disclaimer')}
        animate={collapseAnimate('disclaimer')}
        transition={collapseTransition('disclaimer')}
        className="text-xs text-ink-muted"
      >
        Los datos de la tarjeta los recibe y protege Mercado Pago: nunca pasan por RematAR.
      </motion.p>

      {collapsePhase !== 'idle' && (
        <>
          {/* Anillo tipo horizonte de eventos: gira mientras todo converge y se apaga apenas sale el tilde. */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 90,
              height: 90,
              background: 'conic-gradient(from 0deg, #2451f2, #6e8bf7, transparent 65%, #2451f2)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 62%, #000 63%)',
              maskImage: 'radial-gradient(circle, transparent 62%, #000 63%)',
            }}
            initial={{ opacity: 0, scale: 0, rotate: 0 }}
            animate={
              collapsePhase === 'collapsing'
                ? { opacity: 0.9, scale: 1, rotate: 360 }
                : { opacity: 0, scale: 0, rotate: 0 }
            }
            transition={
              collapsePhase === 'collapsing'
                ? {
                    opacity: { duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.15 },
                    scale: { duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: [0.3, 0.9, 0.3, 1] },
                    rotate: { duration: reduceMotion ? 0 : 0.9, repeat: reduceMotion ? 0 : Infinity, ease: 'linear' },
                  }
                : { duration: reduceMotion ? 0 : 0.2 }
            }
          />
        </>
      )}
      {collapsePhase === 'check' && (
        <>
          {/* Anillo verde que estalla justo cuando el circulito con el tilde sale del punto negro. */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-success-500"
            initial={{ opacity: 0.9, scale: 0.4 }}
            animate={{ opacity: 0, scale: 3.4 }}
            transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-success-50 text-success-600 ring-4 ring-success-100"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.1, ease: POP_EASE }}
          >
            <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
          </motion.span>
          <motion.div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-[calc(50%+52px)] px-4 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.32, delay: reduceMotion ? 0 : 0.32, ease: TEXT_EASE }}
          >
            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink">Garantía activa</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Bloqueamos {formatCurrency(amount, currency)} en tu tarjeta. Ya podés ofertar en este remate.
            </p>
          </motion.div>
        </>
      )}
    </form>
  );
}
