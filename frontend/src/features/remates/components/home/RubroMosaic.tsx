import { ArrowUpRight, Gem, Laptop, Ship } from 'lucide-react';
import { CATEGORY_SHORT_LABELS } from '../../labels';
import type { Remate, RemateCategory } from '../../types';
import { CATEGORY_ICONS, RUBRO_PHOTOS } from './categoryVisuals';
import { optimizedImage } from '../../../../shared/lib/image';

export interface RubroMosaicProps {
  remates: Remate[];
  /** `'all'` quita el filtro de rubro. */
  onSelectCategory: (category: RemateCategory | 'all') => void;
}

function countLabel(count: number): string {
  if (count === 0) return 'Sin remates';
  return `${count} ${count === 1 ? 'remate' : 'remates'}`;
}

/**
 * Mosaico de rubros de tamaños mezclados: fotos grandes, una ficha con el total de remates
 * abiertos y fichas lisas para los rubros sin foto. Cada ficha filtra el índice de abajo
 * por ese rubro (`onSelectCategory`); "Todos los rubros" lo vuelve a abrir.
 */
export function RubroMosaic({ remates, onSelectCategory }: RubroMosaicProps) {
  const countOf = (category: RemateCategory) => remates.filter((r) => r.category === category).length;
  const openCount = remates.filter((r) => r.status === 'live' || r.status === 'scheduled').length;
  const InmueblesIcon = CATEGORY_ICONS.inmuebles;

  return (
    <div className="grid auto-rows-[9.5rem] grid-flow-dense grid-cols-2 gap-3 lg:grid-cols-6">
      <PhotoTile
        className="col-span-2 lg:col-span-3 lg:row-span-2"
        image={RUBRO_PHOTOS.vehiculos}
        category="vehiculos"
        count={countOf('vehiculos')}
        onSelect={onSelectCategory}
        large
      />
      <PhotoTile
        className="row-span-2 lg:col-span-2 lg:row-span-3"
        image={RUBRO_PHOTOS.hacienda}
        category="hacienda"
        count={countOf('hacienda')}
        onSelect={onSelectCategory}
        large
      />
      <div className="flex flex-col justify-between rounded-2xl bg-brand-600 p-5 text-white">
        <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight">{openCount}</span>
        <span className="text-sm text-brand-100">{openCount === 1 ? 'remate abierto' : 'remates abiertos'}</span>
      </div>
      <PhotoTile
        image={RUBRO_PHOTOS.maquinaria}
        category="maquinaria_pesada_y_agricola"
        count={countOf('maquinaria_pesada_y_agricola')}
        onSelect={onSelectCategory}
      />
      <PhotoTile
        className="lg:col-span-2"
        image={RUBRO_PHOTOS.arte}
        category="arte_antiguedades_y_coleccionables"
        count={countOf('arte_antiguedades_y_coleccionables')}
        onSelect={onSelectCategory}
      />
      <button
        type="button"
        onClick={() => onSelectCategory('inmuebles')}
        aria-label={`Ver remates de ${CATEGORY_SHORT_LABELS.inmuebles}`}
        className="flex flex-col justify-between rounded-2xl bg-ink p-5 text-left text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <InmueblesIcon className="h-7 w-7 text-white/80" strokeWidth={1.5} aria-hidden="true" />
        <span>
          <span className="block font-semibold">{CATEGORY_SHORT_LABELS.inmuebles}</span>
          <span className="text-sm text-white/60">{countLabel(countOf('inmuebles'))}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onSelectCategory('all')}
        className="group flex flex-col justify-between rounded-2xl border border-line bg-surface-subtle p-5 text-left transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <span className="flex items-center gap-2 text-ink-faint transition-colors group-hover:text-ink">
          <Gem className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          <Ship className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          <Laptop className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="flex items-end justify-between">
          <span className="font-semibold">Todos los rubros</span>
          <ArrowUpRight
            className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </button>
    </div>
  );
}

function PhotoTile({
  image,
  category,
  count,
  onSelect,
  className = '',
  large = false,
}: {
  image: string;
  category: RemateCategory;
  count: number;
  onSelect: (category: RemateCategory) => void;
  className?: string;
  large?: boolean;
}) {
  const name = CATEGORY_SHORT_LABELS[category];
  return (
    <button
      type="button"
      onClick={() => onSelect(category)}
      aria-label={`Ver remates de ${name}`}
      className={`group relative overflow-hidden rounded-2xl bg-ink text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${className}`}
    >
      <img
        src={optimizedImage(image, 1200)}
        loading="lazy" decoding="async"
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-5">
        <span>
          <span className={`block font-semibold tracking-tight ${large ? 'text-2xl sm:text-3xl' : 'text-base'}`}>
            {name}
          </span>
          <span className="text-sm text-white/75">{countLabel(count)}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink opacity-0 transition-all duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
