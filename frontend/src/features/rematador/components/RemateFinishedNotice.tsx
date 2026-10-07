import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { formatDurationLong } from '../../history/summary';
import { useRemateHistoryDetail } from '../../history/hooks';
import { formatCompactMoney } from '../dashboard';

export type RemateFinishedAudience = 'empresa' | 'martillero' | 'comprador';

export interface RemateFinishedNoticeProps {
  remateId: string;
  audience: RemateFinishedAudience;
  currency: string;
}

const REDIRECT_SECONDS = 4;

const COPY: Record<RemateFinishedAudience, { title: string; description: string; leaving: string }> = {
  empresa: {
    title: 'Cerró con éxito',
    description: 'Ya está listo el resumen con los resultados.',
    leaving: 'Redirigiendo al resumen del remate',
  },
  martillero: {
    title: '¡Remate finalizado!',
    description: 'Gracias por conducir el remate.',
    leaving: 'Volvés a tu panel',
  },
  comprador: {
    title: 'El remate finalizó',
    description: 'Gracias por participar.',
    leaving: 'Te estamos redirigiendo a todos los remates',
  },
};

/**
 * Cartel de "remate finalizado" que se monta cuando llega `remate.finished` por WebSocket
 * (ver `useRemateFinishedSignal`). Mismo lenguaje visual que `TransitionOverlay`/
 * `LoteAdjudicadoOverlay` (fondo borroso, tarjeta blanca, ícono `success`, barra de
 * avance `brand`), con tres destinos según quién mira:
 *
 * - `empresa`: cifras del remate (`GET /history/remates/{id}`, solo dueño) y botones
 *   "Ver resumen completo" / "Ir a mis remates". Si nadie toca nada, a los 4 s va solo al
 *   resumen del remate. Si las cifras no cargan, el cartel igual se muestra sin ellas.
 * - `martillero`: mensaje corto, sin cifras (el historial es solo para la empresa dueña),
 *   y de vuelta a su panel principal.
 * - `comprador`: cartel sobre la sala ya vacía, y de vuelta al listado de remates.
 */
export function RemateFinishedNotice({ remateId, audience, currency }: RemateFinishedNoticeProps) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const copy = COPY[audience];
  const destination =
    audience === 'empresa' ? `/remates/${remateId}/historial` : audience === 'martillero' ? '/' : '/remates';

  // Solo la empresa dueña tiene acceso al detalle del historial.
  const { data: detail } = useRemateHistoryDetail(audience === 'empresa' ? remateId : '');

  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setSecondsLeft(Math.max(0, REDIRECT_SECONDS - Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);
    const redirect = setTimeout(() => navigate(destination), REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(redirect);
    };
  }, [navigate, destination]);

  const stats =
    audience === 'empresa' && detail
      ? [
          {
            label: 'adjudicado',
            value: formatCompactMoney(Number(detail.total_awarded_value) || 0, currency),
            emphasis: true,
          },
          {
            label: 'lotes vendidos',
            value: `${detail.lote_status_counts.closed_sold}/${detail.lote_status_counts.total}`,
          },
          { label: 'duración', value: formatDurationLong(detail.duration_seconds) },
        ]
      : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 font-display backdrop-blur-md">
      <motion.div
        role="status"
        aria-live="polite"
        initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: 8 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-7 text-center shadow-xl"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-600">
          <Check aria-hidden="true" className="h-8 w-8" strokeWidth={2.5} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-success-700">Remate finalizado</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{copy.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{copy.description}</p>
        </div>

        {stats && (
          <dl className="grid w-full grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface-subtle py-3">
            {stats.map((stat) => (
              <div key={stat.label} className="px-2">
                <dd
                  className={`text-lg font-extrabold tabular-nums tracking-tight ${stat.emphasis ? 'text-brand-700' : 'text-ink'}`}
                >
                  {stat.value}
                </dd>
                <dt className="text-xs text-ink-muted">{stat.label}</dt>
              </div>
            ))}
          </dl>
        )}

        <div className="w-full">
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: REDIRECT_SECONDS, ease: 'linear' }}
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
            />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {copy.leaving}
            {secondsLeft > 0 ? ` en ${secondsLeft} s…` : '…'}
          </p>
        </div>

        {audience === 'empresa' && (
          <div className="flex w-full flex-col gap-2">
            <Button variant="primary" onClick={() => navigate(destination)}>
              Ver resumen completo
            </Button>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Ir a mis remates
            </Button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
