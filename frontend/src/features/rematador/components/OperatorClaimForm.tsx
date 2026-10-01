import { useId, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';

export interface OperatorClaimFormProps {
  /** Canjea el código de operador de un remate (`claimOperatorRequest`) y entra a la consola. */
  onClaim: (remateId: string, code: string) => Promise<void>;
}

/**
 * Formulario de canje "paso a paso" (mismo lenguaje que `RedeemForm` del comprador): números
 * grandes e inputs de `text-2xl`; el código se habilita recién con un ID cargado. El botón
 * queda deshabilitado hasta completar ambos campos y, ante un fallo, el mensaje del backend
 * aparece bajo el código y el bloque tiembla una vez. Va alineado a la derecha en desktop.
 */
export function OperatorClaimForm({ onClaim }: OperatorClaimFormProps) {
  const reduceMotion = useReducedMotion();
  const idFieldId = useId();
  const codeId = useId();
  const codeErrorId = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [remateId, setRemateId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasId = remateId.trim() !== '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!hasId) return;
    // Enter en el ID con el código todavía vacío: el paso que sigue es el código.
    if (!code.trim()) {
      codeRef.current?.focus();
      return;
    }
    setIsSubmitting(true);
    try {
      await onClaim(remateId.trim(), code.trim());
    } catch (err) {
      setError(normalizeApiError(err).message);
      setShakes((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Datos de acceso"
      className="w-full max-w-2xl lg:justify-self-end"
    >
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 sm:grid-cols-[4rem_minmax(0,1fr)]">
        <span aria-hidden="true" className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">
          1
        </span>
        <div>
          <label htmlFor={idFieldId} className="text-lg font-medium">
            ID del remate
          </label>
          <input
            id={idFieldId}
            value={remateId}
            onChange={(e) => setRemateId(e.target.value)}
            placeholder="Lo comparte la empresa junto con el código"
            autoComplete="off"
            spellCheck={false}
            required
            className="mt-2 w-full border-b-2 border-line-strong bg-transparent py-3 text-xl outline-none transition-colors placeholder:text-ink-faint focus:border-ink sm:text-2xl"
          />
          <p className="mt-2 min-h-6 text-sm text-ink-muted">
            Es el identificador que te pasó la empresa por WhatsApp o mail.
          </p>
        </div>
      </div>

      <motion.div
        key={shakes}
        animate={reduceMotion || shakes === 0 ? undefined : { x: [0, -10, 9, -6, 4, 0] }}
        transition={{ duration: 0.45 }}
        className={`mt-12 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 transition-opacity duration-500 sm:grid-cols-[4rem_minmax(0,1fr)] ${
          hasId ? 'opacity-100' : 'opacity-35'
        }`}
      >
        <span aria-hidden="true" className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">
          2
        </span>
        <div>
          <label htmlFor={codeId} className="text-lg font-medium">
            Código de operador
          </label>
          <input
            id={codeId}
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
            disabled={!hasId}
            required
            placeholder="Ej: A3K7P2QX"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={codeErrorId}
            className={`mt-2 w-full border-b-2 bg-transparent py-3 text-xl font-semibold uppercase tracking-[0.25em] outline-none transition-colors placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint disabled:cursor-not-allowed sm:text-2xl ${
              error ? 'border-danger-500' : 'border-line-strong focus:border-ink'
            }`}
          />
          <p id={codeErrorId} role="alert" className="mt-2 min-h-6 text-sm text-danger-600">
            {error}
          </p>
        </div>
      </motion.div>

      <div className="mt-8 flex flex-col gap-4 sm:ml-[4rem] sm:flex-row sm:items-center sm:gap-6">
        <button
          type="submit"
          disabled={!hasId || !code.trim() || isSubmitting}
          className="group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Verificando
            </>
          ) : (
            <>
              Entrar a la Consola Operativa
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </>
          )}
        </button>
        <p className="text-sm text-ink-muted">¿No tenés un código? Pedíselo a la empresa que organiza el remate.</p>
      </div>
    </form>
  );
}
