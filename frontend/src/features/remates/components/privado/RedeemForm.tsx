import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { extractRemateId, GENERIC_REDEEM_ERROR, URL_ERROR_MESSAGE } from '../../privateAccess';
import type { Remate } from '../../types';

/** Cuánto se muestra la confirmación "Acceso concedido" antes de entrar solo al remate. */
export const AUTO_ENTER_MS = 1400;

export interface RedeemFormProps {
  /** Canjea el código de un remate (`redeemPrivateAccessRequest`). */
  redeem: (remateId: string, code: string) => Promise<Remate>;
  /** Entra al remate canjeado (navega a su detalle). */
  onEnter: (remate: Remate) => void;
}

/**
 * Formulario de canje "paso a paso": primero la URL, que se valida mientras se pega
 * ("Remate detectado"); recién con una URL válida se habilita el código y el foco salta
 * solo. Mismo contrato que antes: el botón queda deshabilitado hasta completar ambos
 * campos y cualquier fallo del canje muestra el mismo mensaje genérico (anti-enumeración,
 * ver `GENERIC_REDEEM_ERROR`). Si el canje sale bien, una confirmación breve y se entra al
 * remate solo a los `AUTO_ENTER_MS` (o al instante con "Ir al remate").
 */
export function RedeemForm({ redeem, onEnter }: RedeemFormProps) {
  const reduceMotion = useReducedMotion();
  const urlId = useId();
  const codeId = useId();
  const urlHelpId = useId();
  const codeErrorId = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [urlTouched, setUrlTouched] = useState(false);
  const [code, setCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState<Remate | null>(null);

  const urlValid = extractRemateId(url) !== null;
  const urlInvalid = urlTouched && url.trim() !== '' && !urlValid;

  // Al PEGAR una URL válida, el foco salta solo al código. Mientras se tipea a mano no:
  // la URL ya puede ser válida a mitad de camino (antes de un "/sala" final, por ejemplo)
  // y mover el foco ahí cortaría lo que el usuario está escribiendo.
  const pastedRef = useRef(false);
  useEffect(() => {
    if (urlValid && pastedRef.current) codeRef.current?.focus();
    pastedRef.current = false;
  }, [url, urlValid]);

  // Con el canje hecho, entra solo al remate después de la confirmación.
  useEffect(() => {
    if (!redeemed) return;
    const id = window.setTimeout(() => onEnter(redeemed), AUTO_ENTER_MS);
    return () => window.clearTimeout(id);
  }, [redeemed, onEnter]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRedeemError(null);
    setUrlTouched(true);

    const remateId = extractRemateId(url);
    if (!remateId) return;
    // Enter en la URL con el código todavía vacío: el paso que sigue es el código.
    if (!code.trim()) {
      codeRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      setRedeemed(await redeem(remateId, code.trim()));
    } catch {
      // Mensaje genérico a propósito, sin inspeccionar el error -- ver `GENERIC_REDEEM_ERROR`.
      setRedeemError(GENERIC_REDEEM_ERROR);
      setShakes((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (redeemed) {
    return (
      <motion.section
        aria-labelledby="acceso-concedido"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-2xl"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500 text-white">
          <Check className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 id="acceso-concedido" className="mt-6 text-4xl font-semibold tracking-tight">
          Acceso concedido
        </h2>
        <p className="mt-2 text-lg text-ink-muted">Entrando a {redeemed.title}.</p>
        <div className="mt-8 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <motion.div
            className="h-full origin-left rounded-full bg-ink"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: AUTO_ENTER_MS / 1000, ease: 'easeInOut' }}
          />
        </div>
        <button
          type="button"
          onClick={() => onEnter(redeemed)}
          className="group mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Ir al remate
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </motion.section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Datos de acceso" className="max-w-2xl">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 sm:grid-cols-[4rem_minmax(0,1fr)]">
        <span aria-hidden="true" className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">
          1
        </span>
        <div>
          <label htmlFor={urlId} className="text-lg font-medium">
            URL del remate
          </label>
          <input
            id={urlId}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setUrlTouched(true)}
            onPaste={() => {
              pastedRef.current = true;
            }}
            placeholder="Lo comparte la empresa junto con el código"
            autoComplete="off"
            spellCheck={false}
            required
            aria-invalid={urlInvalid}
            aria-describedby={urlHelpId}
            className={`mt-2 w-full border-b-2 bg-transparent py-3 text-xl outline-none transition-colors placeholder:text-ink-faint sm:text-2xl ${
              urlInvalid ? 'border-danger-500' : urlValid ? 'border-success-500' : 'border-line-strong focus:border-ink'
            }`}
          />
          <p id={urlHelpId} aria-live="polite" className="mt-2 min-h-6 text-sm">
            {urlValid ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success-700">
                <Check className="h-4 w-4" aria-hidden="true" /> Remate detectado
              </span>
            ) : urlInvalid ? (
              <span className="text-danger-600">{URL_ERROR_MESSAGE}</span>
            ) : (
              <span className="text-ink-muted">Es la dirección que te pasó la empresa por WhatsApp o mail.</span>
            )}
          </p>
        </div>
      </div>

      <motion.div
        key={shakes}
        animate={reduceMotion || shakes === 0 ? undefined : { x: [0, -10, 9, -6, 4, 0] }}
        transition={{ duration: 0.45 }}
        className={`mt-12 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 transition-opacity duration-500 sm:grid-cols-[4rem_minmax(0,1fr)] ${
          urlValid ? 'opacity-100' : 'opacity-35'
        }`}
      >
        <span aria-hidden="true" className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">
          2
        </span>
        <div>
          <label htmlFor={codeId} className="text-lg font-medium">
            Código de acceso
          </label>
          <input
            id={codeId}
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
            disabled={!urlValid}
            required
            placeholder="Ej: A3K7P2QXHT"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(redeemError)}
            aria-describedby={codeErrorId}
            className={`mt-2 w-full border-b-2 bg-transparent py-3 text-xl font-semibold uppercase tracking-[0.25em] outline-none transition-colors placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint disabled:cursor-not-allowed sm:text-2xl ${
              redeemError ? 'border-danger-500' : 'border-line-strong focus:border-ink'
            }`}
          />
          <p id={codeErrorId} role="alert" className="mt-2 min-h-6 text-sm text-danger-600">
            {redeemError}
          </p>
        </div>
      </motion.div>

      <div className="mt-8 flex flex-col gap-4 sm:ml-[4rem] sm:flex-row sm:items-center sm:gap-6">
        <button
          type="submit"
          disabled={!url.trim() || !code.trim() || isSubmitting}
          className="group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Verificando
            </>
          ) : (
            <>
              Entrar al remate
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </>
          )}
        </button>
        <p className="text-sm text-ink-muted">
          ¿No tenés una URL y un código? Pedíselos a la empresa que organiza el remate.
        </p>
      </div>
    </form>
  );
}
