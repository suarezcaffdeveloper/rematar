import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Timer } from 'lucide-react';
import { CATEGORY_LABELS, STATUS_LABELS } from '../../labels';
import { heroPhotos } from '../../ficha';
import type { Lote, Remate } from '../../types';
import { CoverPlaceholder } from '../CoverPlaceholder';
import { LiveDot } from '../home/LiveDot';

export interface RemateHeroProps {
  remate: Remate;
  lotes: Lote[];
  onEnter: () => void;
}

/** Posición de cada foto del mosaico según cuántas hay: con tres, una grande y dos
 * apiladas; con dos, una ancha y una angosta; con una, ocupa todo. */
const TILE_LAYOUTS: Record<number, string[]> = {
  1: ['col-span-3 row-span-2'],
  2: ['col-span-2 row-span-2', 'col-span-1 row-span-2'],
  3: ['col-span-2 row-span-2', '', ''],
};

/**
 * Portada de la ficha: a un lado el estado, el título y el botón para entrar; al otro, un
 * mosaico con la portada del remate y las fotos de sus primeros lotes (o el degradé de
 * marca si no hay ninguna). Mismo lenguaje visual que el inicio del comprador.
 */
export function RemateHero({ remate, lotes, onEnter }: RemateHeroProps) {
  const reduceMotion = useReducedMotion();
  const live = remate.status === 'live';
  const isTimed = (remate.auction_type ?? 'live') === 'timed';
  const photos = heroPhotos(remate, lotes);

  return (
    <section
      aria-label="Portada del remate"
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-center lg:gap-16"
    >
      <div>
        <p className="flex flex-wrap items-center gap-2.5 text-sm font-medium">
          {live ? <LiveDot /> : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-500" />}
          <span className={live ? 'text-success-700' : 'text-brand-700'}>{STATUS_LABELS[remate.status]}</span>
          <span aria-hidden="true" className="text-ink-faint">
            /
          </span>
          <span className="text-ink-muted">{CATEGORY_LABELS[remate.category]}</span>
          {isTimed && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Timed auction
            </span>
          )}
        </p>
        <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
          {remate.title}
        </h1>
        <button
          type="button"
          onClick={onEnter}
          className="group mt-9 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Entrar al remate
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </div>

      <div aria-hidden="true" className="grid h-[22rem] grid-cols-3 grid-rows-2 gap-2 sm:h-[26rem]">
        {photos.length === 0 ? (
          <CoverPlaceholder className="col-span-3 row-span-2 rounded-2xl" />
        ) : (
          photos.map((url, i) => (
            <motion.div
              key={url}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 * i }}
              className={`overflow-hidden rounded-2xl bg-surface-subtle ${TILE_LAYOUTS[photos.length][i]}`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </motion.div>
          ))
        )}
      </div>
    </section>
  );
}
