import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { RemateCover } from '../../remates/components/home/RemateCover';
import { useLoteCount } from '../../remates/hooks';
import { CATEGORY_SHORT_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { useCursorPreview } from './useCursorPreview';

const dateFormatter = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

/** `"19 sept 2026"`: cuándo terminó el remate (o, sin ese dato, cuándo empezó). */
function formatOperatedDate(remate: Remate): string {
  const iso = remate.finished_at ?? remate.starts_at;
  return iso ? dateFormatter.format(new Date(iso)).replace(/\./g, '') : '';
}

/**
 * "Remates que dirigiste": los remates ya finalizados en los que el usuario fue el operador,
 * como un índice tipográfico con la portada flotante (mismo lenguaje que "Tus remates
 * privados"). Solo finalizados: un rematador opera un remate a la vez, así que el que está
 * en curso se muestra arriba, en `CurrentAssignment`.
 */
export function OperatedRemates({ remates }: { remates: Remate[] }) {
  const { hovered, bind, rowProps, renderPreview } = useCursorPreview<Remate>();

  return (
    <section aria-labelledby="remates-dirigidos" className="mt-24 pb-20">
      <h2 id="remates-dirigidos" className="text-2xl font-semibold tracking-tight">
        Remates que dirigiste
      </h2>
      <p className="mb-6 mt-1 text-ink-muted">Los remates finalizados en los que fuiste el operador.</p>
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
              <OperatedRow remate={remate} />
            </motion.li>
          );
        })}
      </ul>
      {renderPreview((remate) => (
        <RemateCover remate={remate} className="h-full w-full" />
      ))}
    </section>
  );
}

function OperatedRow({ remate }: { remate: Remate }) {
  const loteCount = useLoteCount(remate.id);

  return (
    <Link
      to={`/remates/${remate.id}`}
      className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid-cols-[11rem_minmax(0,1fr)_5rem_8rem_auto]"
    >
      <span className="order-2 text-sm tabular-nums text-ink-muted md:order-none">{formatOperatedDate(remate)}</span>
      <span className="order-1 col-span-2 min-w-0 md:order-none md:col-span-1">
        <span className="block truncate text-xl font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
          {remate.title}
        </span>
        <span className="mt-0.5 block text-sm text-ink-muted">{CATEGORY_SHORT_LABELS[remate.category]}</span>
      </span>
      <span className="hidden text-sm tabular-nums text-ink-muted md:block">
        {loteCount === null ? '' : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}
      </span>
      <span className="hidden text-sm text-ink-muted md:block">Finalizado</span>
      <ArrowUpRight
        className="order-3 h-5 w-5 justify-self-end text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 md:order-none"
        aria-hidden="true"
      />
    </Link>
  );
}
