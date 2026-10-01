import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import type { MockRemate } from './previewInicio/mockRemates';
import { LiveDot, RemateThumb, formatHour, formatWeekdayShort } from './previewInicio/shared';
import { GENERIC_ERROR, REDEEM_STEPS, URL_ERROR, extractRemateId, mockRedeem, useGrantedRemates } from './previewPrivado/shared';

type Status = 'idle' | 'submitting' | 'success';

/**
 * Vista previa B de "Ingresar a remate privado": "paso a paso". El formulario se va
 * habilitando de a un paso: primero la URL, que se valida mientras se pega ("Remate
 * detectado"); recién con una URL válida se habilita el código, que se escribe en
 * tipografía grande. Los tres pasos explicativos pasan a una columna aparte, en segundo
 * plano. Abajo, los remates privados que ya canjeaste como una tira de fotos que se
 * desliza. Canje simulado: cualquier URL con un UUID y el código `REMATE24` entra; lo
 * demás da el error genérico. Datos de prueba, sin backend (`?canjeados=0` muestra el
 * caso sin remates canjeados).
 */
export function PreviewPrivadoBPage() {
  const granted = useGrantedRemates();

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="privado" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="mb-12">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Ingresá a un remate privado
          </h1>
          <p className="mt-5 max-w-md text-ink-muted">
            Pegá la URL del remate y el código de acceso que te compartió la empresa organizadora.
          </p>
        </header>

        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-24">
          <StepForm />

          <aside aria-labelledby="como-title" className="lg:pt-2">
            <h2 id="como-title" className="text-lg font-semibold tracking-tight">
              Cómo conseguir el acceso
            </h2>
            <ol className="mt-5 border-t border-ink pt-6">
              {REDEEM_STEPS.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-4">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
                    {index < REDEEM_STEPS.length - 1 && <span className="my-1 w-px flex-1 bg-line-strong" />}
                  </div>
                  <div className={index < REDEEM_STEPS.length - 1 ? 'pb-6' : ''}>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        {granted.length > 0 && <GrantedStrip remates={granted} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ formulario */

function StepForm() {
  const reduceMotion = useReducedMotion();
  const codeRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [urlTouched, setUrlTouched] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [remate, setRemate] = useState<MockRemate | null>(null);

  const urlValid = extractRemateId(url) !== null;
  const urlError = urlTouched && url.trim() !== '' && !urlValid;

  // Al pasar de "URL inválida" a "URL válida", el foco salta solo al código.
  const wasValid = useRef(false);
  useEffect(() => {
    if (urlValid && !wasValid.current) codeRef.current?.focus();
    wasValid.current = urlValid;
  }, [urlValid]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUrlTouched(true);
    if (!urlValid) return;

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
    setUrlTouched(false);
    setCode('');
    setError(null);
    setRemate(null);
    setStatus('idle');
  }

  if (status === 'success' && remate) {
    return (
      <motion.section
        aria-labelledby="listo-title"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-2xl"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500 text-white">
          <Check className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 id="listo-title" className="mt-6 text-4xl font-semibold tracking-tight">
          Acceso concedido
        </h2>
        <p className="mt-2 text-lg text-ink-muted">Entrando a {remate.title}.</p>
        <div className="mt-8 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <motion.div
            className="h-full origin-left rounded-full bg-ink"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Ir al remate
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </a>
          <button type="button" onClick={reset} className="rounded text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            Reiniciar demo
          </button>
        </div>
      </motion.section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Datos de acceso" className="max-w-2xl">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 sm:grid-cols-[4rem_minmax(0,1fr)]">
        <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">1</span>
        <label className="block">
          <span className="text-lg font-medium">Pegá la URL del remate</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setUrlTouched(true)}
            placeholder="Lo comparte la empresa junto con el código"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={urlError}
            aria-describedby="url-ayuda"
            className={`mt-2 w-full border-b-2 bg-transparent py-3 text-xl outline-none transition-colors placeholder:text-ink-faint sm:text-2xl ${
              urlError ? 'border-danger-500' : urlValid ? 'border-success-500' : 'border-line-strong focus:border-ink'
            }`}
          />
          <p id="url-ayuda" aria-live="polite" className="mt-2 min-h-6 text-sm">
            {urlValid ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success-700">
                <Check className="h-4 w-4" aria-hidden="true" /> Remate detectado
              </span>
            ) : urlError ? (
              <span className="text-danger-600">{URL_ERROR}</span>
            ) : (
              <span className="text-ink-muted">Es la dirección que te pasó la empresa por WhatsApp o mail.</span>
            )}
          </p>
        </label>
      </div>

      <motion.div
        key={shakes}
        animate={reduceMotion || shakes === 0 ? undefined : { x: [0, -10, 9, -6, 4, 0] }}
        transition={{ duration: 0.45 }}
        className={`mt-12 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 transition-opacity duration-500 sm:grid-cols-[4rem_minmax(0,1fr)] ${
          urlValid ? 'opacity-100' : 'opacity-35'
        }`}
      >
        <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">2</span>
        <label className="block">
          <span className="text-lg font-medium">Ingresá el código de acceso</span>
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
            disabled={!urlValid}
            placeholder="Ej: A3K7P2QXHT"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby="codigo-error"
            className={`mt-2 w-full border-b-2 bg-transparent py-3 text-xl font-semibold uppercase tracking-[0.25em] outline-none transition-colors placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint disabled:cursor-not-allowed sm:text-2xl ${
              error ? 'border-danger-500' : 'border-line-strong focus:border-ink'
            }`}
          />
          <p id="codigo-error" role="alert" className="mt-2 min-h-6 text-sm text-danger-600">
            {error}
          </p>
        </label>
      </motion.div>

      <div className="mt-8 flex flex-col gap-4 sm:ml-[4rem] sm:flex-row sm:items-center sm:gap-6">
        <button
          type="submit"
          disabled={!url.trim() || !code.trim() || status === 'submitting'}
          className="group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint"
        >
          {status === 'submitting' ? (
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
        <p className="text-sm text-ink-muted">¿No tenés una URL y un código? Pedíselos a la empresa que organiza el remate.</p>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- ya canjeados */

function GrantedStrip({ remates }: { remates: MockRemate[] }) {
  return (
    <section aria-labelledby="canjeados-title" className="mt-24 pb-20">
      <h2 id="canjeados-title" className="text-2xl font-semibold tracking-tight">
        Tus remates privados
      </h2>
      <p className="mb-6 mt-1 text-ink-muted">Ya entraste a estos: volvé a entrar sin pegar el código de nuevo.</p>
      <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {remates.map((remate) => (
          <li key={remate.id} className="snap-start">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="group relative block h-[22rem] w-[16.5rem] overflow-hidden rounded-2xl bg-ink text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-[18rem]"
            >
              <RemateThumb
                remate={remate}
                className="absolute inset-0 h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
              <p className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink backdrop-blur">
                {remate.status === 'live' ? (
                  <>
                    <LiveDot /> En vivo
                  </>
                ) : (
                  <span className="tabular-nums">
                    {formatWeekdayShort(remate.startsAt)} {remate.startsAt.getDate()}, {formatHour(remate.startsAt)}
                  </span>
                )}
              </p>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-balance text-xl font-semibold leading-tight tracking-tight">{remate.title}</p>
                <p className="mt-1.5 flex items-center justify-between text-sm text-white/75">
                  {remate.lotes} lotes
                  <ArrowRight
                    className="h-5 w-5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                    aria-hidden="true"
                  />
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
