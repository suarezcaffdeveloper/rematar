import { useEffect, useRef, useState } from 'react';
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
 *
 * Accesibilidad (Épica 9, Etapa 7 -- rediseño, accesibilidad final): el número grande
 * ya NO lleva `aria-live` -- lo tenía antes, pero al actualizarse una vez por segundo
 * un lector de pantalla anunciaría el conteo completo cada segundo (antipatrón
 * documentado explícitamente en las WAI-ARIA Authoring Practices para temporizadores).
 * En su lugar, una región `sr-only` separada anuncia solo los dos momentos que
 * importan: al cruzar el umbral urgente (una vez, no en cada segundo posterior) y al
 * llegar a cero.
 */
export function LoteCountdown({ endsAt, pausedRemainingSeconds }: LoteCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const hasAnnouncedUrgentRef = useRef(false);

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

  const isUrgent = pausedRemainingSeconds === null && endsAt !== null && remainingSeconds <= URGENT_THRESHOLD_SECONDS;

  useEffect(() => {
    if (endsAt === null || pausedRemainingSeconds !== null) return;
    if (remainingSeconds === 0) {
      setAnnouncement('Tiempo agotado.');
    } else if (isUrgent && !hasAnnouncedUrgentRef.current) {
      hasAnnouncedUrgentRef.current = true;
      setAnnouncement(`Quedan ${remainingSeconds} segundos.`);
    } else if (!isUrgent) {
      hasAnnouncedUrgentRef.current = false;
    }
  }, [remainingSeconds, isUrgent, endsAt, pausedRemainingSeconds]);

  if (endsAt === null && pausedRemainingSeconds === null) {
    return null;
  }

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-1 rounded-xl border px-6 py-3 text-center',
        isUrgent ? 'border-danger-300 bg-danger-50' : 'border-warning-200 bg-warning-50',
      )}
    >
      <span
        className={clsx(
          'text-xs font-semibold uppercase tracking-wide',
          isUrgent ? 'text-danger-600' : 'text-warning-700',
        )}
      >
        {pausedRemainingSeconds !== null ? 'Timer pausado' : 'Tiempo restante'}
      </span>
      <span
        role="timer"
        className={clsx(
          'text-5xl font-extrabold tabular-nums leading-none',
          isUrgent ? 'animate-pulse text-danger-600' : 'text-warning-600',
        )}
      >
        {formatSeconds(remainingSeconds)}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
