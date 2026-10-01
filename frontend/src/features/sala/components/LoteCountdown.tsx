import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Clock3 } from 'lucide-react';

export interface LoteCountdownProps {
  /** Deadline absoluto (ISO 8601, UTC) mientras el timer corre -- `null` si está
   * pausado o el lote nunca tuvo timer. */
  endsAt: string | null;
  /** Segundos congelados mientras está pausado -- `null` si corre o nunca tuvo timer. */
  pausedRemainingSeconds: number | null;
  /** `'compact'` (default): número grande + segundero, como en la Sala LIVE. `'boxed'`:
   * cuatro cajas separadas (días/horas/min/seg), pedidas para la Sala Timed -- mismo
   * estado/lógica de urgencia y anuncios, solo cambia el render. */
  variant?: 'compact' | 'boxed' | 'inline' | 'strip';
  /** Solo `variant="inline"`. `'sm'` (default): píldora de una línea, para meter dentro
   * de una card. `'md'`: texto suelto un poco más grande, para una cabecera. */
  size?: 'sm' | 'md';
  /** Cuántos segundos antes del cierre pasa a rojo y se anuncia a lectores de pantalla.
   * Default: 10 (un martillo en vivo). La Sala Timed usa 5 minutos: ahí "urgente" es
   * "todavía hay tiempo de ofertar, pero ya no de pensarlo". */
  urgentThresholdSeconds?: number;
}

const URGENT_THRESHOLD_SECONDS = 10;

/** Unidades para el render `boxed` -- siempre las cuatro, con cero a la izquierda, a
 * diferencia de `formatCountdownParts` (que omite unidades en cero para el render
 * compacto de una sola línea). */
function splitCountdownUnits(totalSeconds: number): { days: string; hours: string; minutes: string; seconds: string } {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

/** Días/horas/minutos (el número grande) + segundos por separado (el "segundero", más
 * chico -- pedido explícito) -- unidades por encima del minuto se omiten cuando valen 0
 * (un lote que cierra en 40 minutos no necesita "0d 0h"), pero minutos siempre se
 * muestran, incluso en "0m", para que el número grande nunca desaparezca. */
function formatCountdownParts(totalSeconds: number): { major: string; seconds: string } {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const majorParts: string[] = [];
  if (days > 0) majorParts.push(`${days}d`);
  if (days > 0 || hours > 0) majorParts.push(`${String(hours).padStart(days > 0 ? 2 : 1, '0')}h`);
  majorParts.push(`${String(minutes).padStart(days > 0 || hours > 0 ? 2 : 1, '0')}m`);

  return { major: majorParts.join(' '), seconds: `${String(seconds).padStart(2, '0')}s` };
}

/**
 * Cuenta regresiva grande y visible (Épica 8, "cuenta regresiva y cierre automático").
 * El backend es la única fuente de verdad del tiempo restante (ADR-043) -- este
 * componente nunca decide por sí solo cuándo el lote se cierra, solo muestra el
 * conteo: un `setInterval` local recalcula `endsAt - Date.now()` una vez por segundo
 * para el efecto visual de tictac, pero el valor de `endsAt` en sí siempre viene de
 * `active_lote.timer_ends_at` (snapshot o evento de dominio ya reconciliado por
 * `reducer.ts`), nunca se acumula localmente -- así que un reloj de cliente adelantado
 * o atrasado nunca puede desviar el conteo más de lo que ya estaba desviado el reloj,
 * y cada evento/reconexión lo corrige solo.
 *
 * Sin `endsAt` ni `pausedRemainingSeconds`: el lote/remate no tiene timer configurado
 * -- no renderiza nada (`ActiveLotePanel` sigue mostrando el resto del panel igual).
 *
 * Accesibilidad (Épica 9, Etapa 7 -- rediseño, accesibilidad final): el número grande
 * ya NO lleva `aria-live` -- lo tenía antes, pero al actualizarse una vez por segundo
 * un lector de pantalla anunciaría el conteo completo cada segundo (antipatrón
 * documentado explícitamente en las WAI-ARIA Authoring Practices para temporizadores).
 * En su lugar, una región `sr-only` separada anuncia solo los dos momentos que
 * importan: al cruzar el umbral urgente (una vez, no en cada segundo posterior) y al
 * llegar a cero.
 */
export function LoteCountdown({
  endsAt,
  pausedRemainingSeconds,
  variant = 'compact',
  size = 'sm',
  urgentThresholdSeconds = URGENT_THRESHOLD_SECONDS,
}: LoteCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const hasAnnouncedUrgentRef = useRef(false);

  // Anti-sniping: si el cierre se corre hacia adelante (alguien ofertó sobre el final),
  // `variant="strip"` lo avisa unos segundos.
  const [wasExtended, setWasExtended] = useState(false);
  const previousEndsAtRef = useRef(endsAt);
  useEffect(() => {
    const previous = previousEndsAtRef.current;
    previousEndsAtRef.current = endsAt;
    if (previous === null || endsAt === null) return;
    if (new Date(endsAt).getTime() <= new Date(previous).getTime()) return;
    setWasExtended(true);
    const timeoutId = setTimeout(() => setWasExtended(false), 4000);
    return () => clearTimeout(timeoutId);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt === null) return;
    hasAnnouncedUrgentRef.current = false;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  const remainingSeconds =
    pausedRemainingSeconds !== null
      ? pausedRemainingSeconds
      : endsAt !== null
        ? Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000))
        : 0;

  const isUrgent = pausedRemainingSeconds === null && endsAt !== null && remainingSeconds <= urgentThresholdSeconds;

  useEffect(() => {
    if (endsAt === null || pausedRemainingSeconds !== null) return;
    if (remainingSeconds === 0) {
      setAnnouncement('Tiempo agotado.');
    } else if (isUrgent && !hasAnnouncedUrgentRef.current) {
      hasAnnouncedUrgentRef.current = true;
      setAnnouncement(
        remainingSeconds >= 60
          ? `Quedan ${Math.round(remainingSeconds / 60)} minutos.`
          : `Quedan ${remainingSeconds} segundos.`,
      );
    } else if (!isUrgent) {
      hasAnnouncedUrgentRef.current = false;
    }
  }, [remainingSeconds, isUrgent, endsAt, pausedRemainingSeconds]);

  if (endsAt === null && pausedRemainingSeconds === null) {
    return null;
  }

  const label = pausedRemainingSeconds !== null ? 'Timer pausado' : 'Tiempo restante';

  if (variant === 'inline') {
    // Una sola línea, sin caja de tres renglones ni label propio: pensada para convivir
    // con otros datos (una card de lote, una cabecera) sin dominar la pantalla.
    const { major, seconds } = formatCountdownParts(remainingSeconds);
    const isPaused = pausedRemainingSeconds !== null;
    return (
      <span
        className={clsx(
          'inline-flex max-w-full items-baseline gap-1 whitespace-nowrap tabular-nums leading-none',
          size === 'sm' && 'rounded-full px-2 py-1',
          size === 'sm' && (isUrgent ? 'bg-danger-50 text-danger-600' : 'bg-warning-50 text-warning-700'),
          size === 'md' && (isUrgent ? 'text-danger-600' : 'text-ink'),
          isUrgent && 'animate-pulse',
        )}
      >
        {isPaused && (
          <span className="text-[10px] font-semibold uppercase tracking-wide">Pausado</span>
        )}
        <span
          role="timer"
          aria-label={label}
          className="inline-flex items-baseline gap-1"
        >
          <span className={size === 'md' ? 'text-xl font-semibold' : 'text-xs font-semibold'}>{major}</span>
          <span className={size === 'md' ? 'text-sm font-medium text-ink-faint' : 'text-[10px] font-medium opacity-70'}>
            {seconds}
          </span>
        </span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      </span>
    );
  }

  if (variant === 'strip') {
    // La cuenta regresiva del lote en la Sala Timed: una franja con los números en línea,
    // neutra mientras sobra tiempo y roja cuando queda poco. Las unidades que todavía no
    // corresponden (días, horas) no se muestran.
    const units = splitCountdownUnits(remainingSeconds);
    const isPaused = pausedRemainingSeconds !== null;
    const segments = [
      { value: units.days, label: 'días', show: remainingSeconds >= 86400 },
      { value: units.hours, label: 'horas', show: remainingSeconds >= 3600 },
      { value: units.minutes, label: 'min', show: true },
      { value: units.seconds, label: 'seg', show: true },
    ].filter((segment) => segment.show);

    return (
      <div
        className={clsx(
          'rounded-xl border px-4 py-3.5 transition-colors',
          isUrgent ? 'border-danger-200 bg-danger-50' : 'border-line bg-surface-subtle',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 text-xs font-semibold',
              isUrgent ? 'text-danger-600' : 'text-ink-muted',
            )}
          >
            <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
            {isPaused ? label : isUrgent ? 'Está por cerrar' : 'Cierra en'}
          </span>
          {wasExtended && (
            <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700">
              +1 min por oferta final
            </span>
          )}
        </div>
        <div
          role="timer"
          aria-label={label}
          className={clsx(
            'mt-1.5 flex items-end gap-3 font-mono tabular-nums',
            isUrgent ? 'text-danger-600' : 'text-ink',
          )}
        >
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-baseline gap-1">
              <span className="text-[2rem] font-extrabold leading-none">{segment.value}</span>
              <span className="font-display text-[11px] font-medium text-ink-faint">{segment.label}</span>
            </div>
          ))}
        </div>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      </div>
    );
  }

  if (variant === 'boxed') {
    const units = splitCountdownUnits(remainingSeconds);
    const boxes: Array<{ value: string; label: string }> = [
      { value: units.days, label: 'Días' },
      { value: units.hours, label: 'Horas' },
      { value: units.minutes, label: 'Min' },
      { value: units.seconds, label: 'Seg' },
    ];

    return (
      <div
        className={clsx(
          'rounded-xl border p-4',
          isUrgent ? 'border-danger-300 bg-danger-50' : 'border-warning-200 bg-warning-50',
        )}
      >
        <span
          className={clsx(
            'text-xs font-semibold uppercase tracking-wide',
            isUrgent ? 'text-danger-600' : 'text-warning-700',
          )}
        >
          {label}
        </span>
        <div
          role="timer"
          className={clsx('mt-2.5 grid grid-cols-4 gap-2 tabular-nums', isUrgent && 'animate-pulse')}
        >
          {boxes.map((box) => (
            <div key={box.label} className="rounded-lg bg-white py-2 text-center">
              <p className={clsx('font-mono text-xl font-extrabold', isUrgent ? 'text-danger-600' : 'text-warning-600')}>
                {box.value}
              </p>
              <p
                className={clsx(
                  'text-[9px] font-semibold uppercase tracking-wide',
                  isUrgent ? 'text-danger-600' : 'text-warning-700',
                )}
              >
                {box.label}
              </p>
            </div>
          ))}
        </div>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      </div>
    );
  }

  const { major, seconds } = formatCountdownParts(remainingSeconds);

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-1 rounded-xl border px-4 py-3 text-center',
        isUrgent ? 'border-danger-300 bg-danger-50' : 'border-warning-200 bg-warning-50',
      )}
    >
      <span
        className={clsx(
          'text-xs font-semibold uppercase tracking-wide',
          isUrgent ? 'text-danger-600' : 'text-warning-700',
        )}
      >
        {label}
      </span>
      <span
        role="timer"
        className={clsx(
          'flex items-baseline gap-1.5 tabular-nums leading-none',
          isUrgent ? 'animate-pulse text-danger-600' : 'text-warning-600',
        )}
      >
        <span className="text-3xl font-extrabold">{major}</span>
        <span className="text-sm font-semibold">{seconds}</span>
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
