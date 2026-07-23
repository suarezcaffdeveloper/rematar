import { useEffect, useState } from 'react';
import clsx from 'clsx';

export interface LoteCountdownProps {
  /** Deadline absoluto (ISO 8601, UTC) mientras el timer corre -- `null` si está
   * pausado o el lote nunca tuvo timer. */
  endsAt: string | null;
  /** Segundos congelados mientras está pausado -- `null` si corre o nunca tuvo timer. */
  pausedRemainingSeconds: number | null;
}

const URGENT_THRESHOLD_SECONDS = 10;

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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
 */
export function LoteCountdown({ endsAt, pausedRemainingSeconds }: LoteCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (endsAt === null && pausedRemainingSeconds === null) {
    return null;
  }

  const remainingSeconds =
    pausedRemainingSeconds !== null
      ? pausedRemainingSeconds
      : Math.max(0, Math.round((new Date(endsAt as string).getTime() - now) / 1000));

  const isUrgent = pausedRemainingSeconds === null && remainingSeconds <= URGENT_THRESHOLD_SECONDS;

  return (
    <div
      className={clsx(
        'flex items-center justify-between rounded-lg border px-4 py-3',
        isUrgent ? 'border-danger-300 bg-danger-50' : 'border-slate-200 bg-slate-50',
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {pausedRemainingSeconds !== null ? 'Timer pausado' : 'Tiempo restante'}
      </span>
      <span
        role="timer"
        aria-live="polite"
        className={clsx(
          'text-3xl font-bold tabular-nums',
          isUrgent ? 'animate-pulse text-danger-600' : 'text-slate-900',
        )}
      >
        {formatSeconds(remainingSeconds)}
      </span>
    </div>
  );
}
