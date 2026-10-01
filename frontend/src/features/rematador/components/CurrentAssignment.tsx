import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../../../shared/lib/format';
import { LiveDot } from '../../remates/components/home/LiveDot';
import { RemateCover } from '../../remates/components/home/RemateCover';
import { useLoteCount } from '../../remates/hooks';
import { STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';

/**
 * Lo primero que ve un rematador con un remate ya asignado: resuelve el caso de "salió sin
 * querer de la consola operativa" sin pedirle un código nuevo (`claim_operator` solo revoca
 * al canjear uno nuevo, no por perder la pestaña). Panel oscuro con la portada y el acceso a
 * la consola, y al costado los datos del remate (mismo lenguaje que el héroe de "Mis compras").
 */
export function CurrentAssignment({ remate }: { remate: Remate }) {
  const navigate = useNavigate();
  const loteCount = useLoteCount(remate.id);

  const facts: Array<[string, string]> = [];
  if (remate.starts_at) facts.push(['Empieza', formatDateTime(remate.starts_at)]);
  if (loteCount !== null) facts.push(['Lotes', String(loteCount)]);
  facts.push(['Tu rol', 'Operador']);

  return (
    <div className="grid gap-6 lg:h-[26rem] lg:grid-cols-[minmax(0,1fr)_23rem]">
      <article className="group relative flex min-h-[24rem] items-end overflow-hidden rounded-2xl bg-ink text-white">
        <RemateCover
          remate={remate}
          className="absolute inset-0 h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-ink/10" />
        <div className="relative flex flex-col items-start gap-4 p-6 sm:p-9">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            {remate.status === 'live' && <LiveDot />}
            {STATUS_LABELS[remate.status]}
          </span>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl">
            {remate.title}
          </h2>
          <button
            type="button"
            onClick={() => navigate(`/remates/${remate.id}/gestionar`)}
            className="group/cta inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Volver a la consola operativa
            <ArrowRight className="h-5 w-5 transition-transform group-hover/cta:translate-x-1" aria-hidden="true" />
          </button>
        </div>
      </article>

      <aside aria-labelledby="datos-remate-asignado" className="rounded-2xl border border-line p-6">
        <h2 id="datos-remate-asignado" className="text-lg font-semibold tracking-tight">
          Datos del remate
        </h2>
        <dl className="mt-4 divide-y divide-line border-t border-line">
          {facts.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3.5">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-right font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
