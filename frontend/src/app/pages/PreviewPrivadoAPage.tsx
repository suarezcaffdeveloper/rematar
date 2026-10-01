import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import type { MockRemate } from './previewInicio/mockRemates';
import { CATEGORY_SHORT, LiveDot, RemateThumb, formatHour, formatWeekdayShort } from './previewInicio/shared';
import { useCursorPreview } from './previewPrivado/CursorPreview';
import { GENERIC_ERROR, REDEEM_STEPS, URL_ERROR, extractRemateId, mockRedeem, useGrantedRemates } from './previewPrivado/shared';

type Status = 'idle' | 'submitting' | 'success';

/**
 * Vista previa A de "Ingresar a remate privado": "pase de acceso". A la izquierda, el
 * titular y los tres pasos de siempre; a la derecha, un panel oscuro (mismo lenguaje que
 * la galería del inicio) donde el código se escribe en casilleros -- uno por carácter -- y
 * se "llenan" al tipear; si el canje falla, los casilleros tiemblan. Debajo, los remates
 * privados que ya canjeaste como un índice con foto flotante. Canje simulado: cualquier
 * URL con un UUID y el código `REMATE24` entra; lo demás da el error genérico. Datos de
 * prueba, sin backend (`?canjeados=0` muestra el caso sin remates canjeados).
 */
export function PreviewPrivadoAPage() {
  const granted = useGrantedRemates();

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="privado" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-20">
          <div>
            <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Entrá a un remate privado
            </h1>
            <p className="mt-5 max-w-md text-ink-muted">
              Pegá la URL del remate y el código de acceso que te compartió la empresa organizadora.
            </p>

            <ol className="mt-12 max-w-lg border-t border-ink">
              {REDEEM_STEPS.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-line py-5">
                  <span className="text-3xl font-semibold leading-none tabular-nums tracking-tight text-ink-faint">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <AccessPanel />
        </div>

        {granted.length > 0 && <GrantedIndex remates={granted} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- panel */

function AccessPanel() {
  const reduceMotion = useReducedMotion();
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [remate, setRemate] = useState<MockRemate | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!extractRemateId(url)) {
      setError(URL_ERROR);
      setShakes((n) => n + 1);
      return;
    }

    setStatus('submitting');
    try {
      setRemate(await mockRedeem(url, code));
      setStatus('success');
    } catch {
      // Mensaje genérico a propósito (anti-enumeración), igual que la pantalla real.
      setError(GENERIC_ERROR);
      setShakes((n) => n + 1);
      setStatus('idle');
    }
  }

  function reset() {
    setUrl('');
    setCode('');
    setError(null);
    setRemate(null);
    setStatus('idle');
  }

  return (
    <section aria-labelledby="acceso-title" className="overflow-hidden rounded-2xl bg-ink p-7 text-white shadow-xl sm:p-9">
      {status === 'success' && remate ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-h-[22rem] flex-col items-start justify-between gap-8"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500 text-white">
            <Check className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="acceso-title" className="text-3xl font-semibold tracking-tight">
              Acceso concedido
            </h2>
            <p className="mt-2 text-white/75">Ya podés entrar a {remate.title}.</p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-4">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Ir al remate
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
            <button type="button" onClick={reset} className="rounded text-sm text-white/60 underline-offset-4 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              Reiniciar demo
            </button>
          </div>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <h2 id="acceso-title" className="text-xl font-semibold tracking-tight">
            Datos de acceso
          </h2>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-white/75">URL del remate</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Lo comparte la empresa junto con el código"
              autoComplete="off"
              spellCheck={false}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/35 transition-colors focus:border-white focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-white/75">Código de acceso</span>
            <CodeBoxes value={code} onChange={setCode} shakes={shakes} hasError={Boolean(error)} reduceMotion={Boolean(reduceMotion)} />
          </div>

          <div aria-live="polite" className="min-h-5 text-sm text-danger-300">
            {error}
          </div>

          <button
            type="submit"
            disabled={!url.trim() || !code.trim() || status === 'submitting'}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Verificando
              </>
            ) : (
              'Entrar al remate'
            )}
          </button>

          <p className="text-center text-xs text-white/55">
            ¿No tenés una URL y un código? Pedíselos a la empresa que organiza el remate.
          </p>
        </form>
      )}
    </section>
  );
}

/** El código, un casillero por carácter. Por debajo hay un único `<input>` transparente que
 * recibe el teclado y el pegado, así que se comporta como cualquier campo de texto. */
function CodeBoxes({
  value,
  onChange,
  shakes,
  hasError,
  reduceMotion,
}: {
  value: string;
  onChange: (value: string) => void;
  shakes: number;
  hasError: boolean;
  reduceMotion: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const count = Math.min(Math.max(10, value.length), 16);

  return (
    <motion.div
      key={shakes}
      className="relative"
      animate={reduceMotion || shakes === 0 ? undefined : { x: [0, -10, 9, -6, 4, 0] }}
      transition={{ duration: 0.45 }}
    >
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => {
          const isCaret = focused && i === Math.min(value.length, count - 1);
          return (
            <span
              key={i}
              className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border text-lg font-semibold tabular-nums transition-colors ${
                hasError
                  ? 'border-danger-400 bg-danger-500/15'
                  : isCaret
                    ? 'border-white bg-white/15 ring-2 ring-white/30'
                    : value[i]
                      ? 'border-white/40 bg-white/15'
                      : 'border-white/15 bg-white/5'
              }`}
            >
              {value[i]}
            </span>
          );
        })}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Código de acceso"
        autoComplete="off"
        spellCheck={false}
        maxLength={16}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </motion.div>
  );
}

/* ----------------------------------------------------------- ya canjeados */

function GrantedIndex({ remates }: { remates: MockRemate[] }) {
  const { hovered, bind, rowProps, renderPreview } = useCursorPreview<MockRemate>();

  return (
    <section aria-labelledby="canjeados-title" className="mt-24 pb-20">
      <h2 id="canjeados-title" className="text-2xl font-semibold tracking-tight">
        Tus remates privados
      </h2>
      <p className="mb-6 mt-1 text-ink-muted">Ya entraste a estos: volvé a entrar sin pegar el código de nuevo.</p>
      <ul className="border-t border-ink" {...bind}>
        {remates.map((remate) => {
          const dimmed = hovered !== null && hovered.id !== remate.id;
          return (
            <motion.li
              key={remate.id}
              initial={false}
              animate={{ opacity: dimmed ? 0.35 : 1 }}
              transition={{ duration: 0.25 }}
              className="border-b border-line"
              {...rowProps(remate)}
            >
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid-cols-[11rem_minmax(0,1fr)_12rem_5rem_auto]"
              >
                <span className="order-2 text-sm md:order-none">
                  {remate.status === 'live' ? (
                    <span className="inline-flex items-center gap-2 font-medium text-success-700">
                      <LiveDot /> En vivo
                    </span>
                  ) : (
                    <span className="tabular-nums text-ink-muted">
                      {formatWeekdayShort(remate.startsAt)} {remate.startsAt.getDate()}, {formatHour(remate.startsAt)}
                    </span>
                  )}
                </span>
                <span className="order-1 col-span-2 min-w-0 md:order-none md:col-span-1">
                  <span className="block truncate text-xl font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
                    {remate.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{CATEGORY_SHORT[remate.category]}</span>
                </span>
                <span className="hidden truncate text-sm text-ink-muted md:block">{remate.location}</span>
                <span className="hidden text-sm tabular-nums text-ink-muted md:block">{remate.lotes} lotes</span>
                <ArrowUpRight
                  className="order-3 h-5 w-5 justify-self-end text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 md:order-none"
                  aria-hidden="true"
                />
              </a>
            </motion.li>
          );
        })}
      </ul>
      {renderPreview((remate) => (
        <RemateThumb remate={remate} className="h-full w-full" />
      ))}
    </section>
  );
}
