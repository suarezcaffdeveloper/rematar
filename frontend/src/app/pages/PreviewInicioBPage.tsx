import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Gem, Laptop, Search, Ship, Timer } from 'lucide-react';
import {
  CATEGORY_ICONS,
  CATEGORY_SHORT,
  LiveDot,
  RemateThumb,
  formatDay,
  formatHour,
  formatWeekdayShort,
  money,
  sameDay,
} from './previewInicio/shared';
import { ALL_MOCK_REMATES, LIVE_REMATES, useLiveBids, type MockRemate } from './previewInicio/mockRemates';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';

const ROTATE_MS = 7000;

/**
 * Vista previa B del inicio del comprador: "galería + mosaico + índice". Los remates en
 * vivo son una galería de paneles que se abren como un acordeón (el activo se expande y
 * muestra la oferta en tiempo real, los demás quedan como tiras con el título girado). Los
 * rubros forman un mosaico de tamaños mezclados -- fotos, un número y fichas lisas -- y
 * "todos los remates" es un índice tipográfico: se filtra por día y por texto, y al pasar
 * el mouse por una fila aparece flotando la foto del remate. Datos de prueba, sin backend.
 */
export function PreviewInicioBPage() {
  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            {LIVE_REMATES.length} remates suenan el martillo ahora mismo
          </h1>
          <p className="max-w-sm text-ink-muted">
            Elegí uno y entrá a la sala. Si todavía no arrancó lo que buscás, abajo está todo lo que viene.
          </p>
        </header>

        <LiveGallery />

        <section aria-labelledby="mosaic-title" className="mt-20">
          <h2 id="mosaic-title" className="mb-6 text-2xl font-semibold tracking-tight">
            Explorá por rubro
          </h2>
          <Mosaic />
        </section>

        <RemateIndex />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ galería */

function LiveGallery() {
  const reduceMotion = useReducedMotion();
  const bids = useLiveBids(LIVE_REMATES);
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (hovering || reduceMotion) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % LIVE_REMATES.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [hovering, reduceMotion, active]);

  return (
    <section
      aria-label="Remates en vivo"
      className="flex h-[38rem] flex-col gap-2 lg:h-[34rem] lg:flex-row"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      {LIVE_REMATES.map((remate, i) => {
        const isActive = i === active;
        const bid = bids[remate.id];
        return (
          <article
            key={remate.id}
            onMouseEnter={() => setActive(i)}
            className={`relative min-h-0 min-w-0 basis-0 overflow-hidden rounded-2xl bg-ink transition-[flex-grow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isActive ? 'grow-[7]' : 'grow-[1]'
            }`}
          >
            <img
              src={remate.image ?? ''}
              alt=""
              style={{ objectPosition: remate.imagePosition }}
              className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out ${
                isActive ? 'scale-100' : 'scale-110'
              }`}
            />
            <div
              className={`absolute inset-0 transition-opacity duration-700 ${
                isActive ? 'bg-gradient-to-t from-ink/90 via-ink/25 to-transparent' : 'bg-ink/55'
              }`}
            />

            {/* Tira colapsada: título girado en escritorio, horizontal en mobile. */}
            <div
              className={`absolute inset-0 flex items-center gap-3 p-4 transition-opacity duration-300 lg:flex-col lg:justify-end lg:pb-6 ${
                isActive ? 'pointer-events-none opacity-0' : 'opacity-100 delay-300'
              }`}
              aria-hidden={isActive}
            >
              <LiveDot className="shrink-0 lg:mb-auto" />
              <span className="line-clamp-1 text-sm font-medium text-white lg:[writing-mode:vertical-rl] lg:rotate-180 lg:text-base">
                {remate.title}
              </span>
            </div>
            {!isActive && (
              <button
                type="button"
                aria-label={`Abrir ${remate.title}`}
                onClick={() => setActive(i)}
                className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
              />
            )}

            {/* Panel abierto. */}
            <div
              className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 text-white transition-all duration-500 sm:p-8 ${
                isActive ? 'translate-y-0 opacity-100 delay-300' : 'pointer-events-none translate-y-4 opacity-0'
              }`}
              aria-hidden={!isActive}
            >
              <p className="flex items-center gap-2 text-sm text-white/80">
                <LiveDot /> En vivo
                <span className="text-white/40">/</span>
                {CATEGORY_SHORT[remate.category]}
                <span className="hidden text-white/40 sm:inline">/</span>
                <span className="hidden sm:inline">{remate.connected} conectados</span>
              </p>
              <h2 className="max-w-xl text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {remate.title}
              </h2>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-white/65">
                    Lote {remate.currentLot?.number}: {remate.currentLot?.title}
                  </p>
                  <motion.p
                    key={bid.bump}
                    className="mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl"
                    initial={bid.bump === 0 ? false : { color: '#86efac', scale: 1.04 }}
                    animate={{ color: '#ffffff', scale: 1 }}
                    style={{ transformOrigin: 'left' }}
                    transition={{ duration: 0.6 }}
                  >
                    {money(bid.bid)}
                  </motion.p>
                </div>
                <a
                  href="#"
                  tabIndex={isActive ? 0 : -1}
                  onClick={(e) => e.preventDefault()}
                  className="group inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  Entrar a la sala
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </a>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------------ mosaico */

function countOf(category: MockRemate['category']): number {
  return ALL_MOCK_REMATES.filter((r) => r.category === category).length;
}

function Mosaic() {
  return (
    <div className="grid auto-rows-[9.5rem] grid-flow-dense grid-cols-2 gap-3 lg:grid-cols-6">
      <PhotoTile
        className="col-span-2 lg:col-span-3 lg:row-span-2"
        image="/rubros/vehiculos.jpg"
        name="Vehículos"
        count={countOf('vehiculos')}
        large
      />
      <PhotoTile
        className="row-span-2 lg:col-span-2 lg:row-span-3"
        image="/rubros/hacienda-ganaderia.webp"
        name="Hacienda"
        count={countOf('hacienda')}
        large
      />
      <div className="flex flex-col justify-between rounded-2xl bg-brand-600 p-5 text-white">
        <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight">{ALL_MOCK_REMATES.length}</span>
        <span className="text-sm text-brand-100">remates abiertos esta semana</span>
      </div>
      <PhotoTile
        image="/rubros/maquinaria-pesada.jpg"
        name="Maquinaria"
        count={countOf('maquinaria_pesada_y_agricola')}
      />
      <PhotoTile
        className="lg:col-span-2"
        image="/rubros/antiguedades-coleccionables.jpg"
        name="Arte y antigüedades"
        count={countOf('arte_antiguedades_y_coleccionables')}
      />
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="group flex flex-col justify-between rounded-2xl bg-ink p-5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <CATEGORY_ICONS.inmuebles className="h-7 w-7 text-white/80" strokeWidth={1.5} aria-hidden="true" />
        <span>
          <span className="block font-semibold">Inmuebles</span>
          <span className="text-sm text-white/60">
            {countOf('inmuebles')} {countOf('inmuebles') === 1 ? 'remate' : 'remates'}
          </span>
        </span>
      </a>
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="group flex flex-col justify-between rounded-2xl border border-line bg-surface-subtle p-5 transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
      </a>
    </div>
  );
}

function PhotoTile({
  image,
  name,
  count,
  className = '',
  large = false,
}: {
  image: string;
  name: string;
  count: number;
  className?: string;
  large?: boolean;
}) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={`group relative overflow-hidden rounded-2xl bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${className}`}
    >
      <img
        src={image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-5">
        <span>
          <span className={`block font-semibold tracking-tight ${large ? 'text-2xl sm:text-3xl' : 'text-base'}`}>{name}</span>
          <span className="text-sm text-white/75">{count} {count === 1 ? 'remate' : 'remates'}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink opacity-0 transition-all duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------------- índice */

function RemateIndex() {
  const [day, setDay] = useState<Date | 'all'>('all');
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<MockRemate | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 32, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 320, damping: 32, mass: 0.6 });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_MOCK_REMATES.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (day === 'all') return true;
      return sameDay(r.startsAt, day);
    }).sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || a.startsAt.getTime() - b.startsAt.getTime());
  }, [day, query]);

  return (
    <section aria-labelledby="index-title" className="mt-20 pb-16">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <h2 id="index-title" className="text-2xl font-semibold tracking-tight">
          Todos los remates
        </h2>
        <label className="relative block w-full lg:w-80">
          <span className="sr-only">Buscar remates por título</span>
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título"
            className="w-full border-b border-line-strong bg-transparent py-2 pl-7 pr-2 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
          />
        </label>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por día">
        <DayChip selected={day === 'all'} onClick={() => setDay('all')}>
          <span className="text-sm font-semibold">Todos</span>
          <span className="text-xs text-ink-muted">{ALL_MOCK_REMATES.length}</span>
        </DayChip>
        {days.map((d, i) => {
          const n = ALL_MOCK_REMATES.filter((r) => sameDay(r.startsAt, d)).length;
          return (
            <DayChip key={d.toDateString()} selected={day !== 'all' && sameDay(day, d)} disabled={n === 0} onClick={() => setDay(d)}>
              <span className="text-xs capitalize text-ink-muted">{i === 0 ? 'Hoy' : formatWeekdayShort(d)}</span>
              <span className="text-lg font-semibold leading-none tabular-nums">{d.getDate()}</span>
              <span className="flex h-1.5 gap-0.5" aria-label={`${n} remates`}>
                {Array.from({ length: Math.min(n, 5) }, (_, k) => (
                  <span key={k} className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                ))}
              </span>
            </DayChip>
          );
        })}
      </div>

      <ul
        className="mt-6 border-t border-ink"
        onMouseMove={(e) => {
          x.set(e.clientX + 28);
          y.set(e.clientY - 96);
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((remate) => {
            const dimmed = hovered !== null && hovered.id !== remate.id;
            const Icon = CATEGORY_ICONS[remate.category];
            return (
              <motion.li
                key={remate.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: dimmed ? 0.35 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="border-b border-line"
                onMouseEnter={(e) => {
                  // Posiciona la foto ya en la entrada: sin esto, aparece un instante en
                  // (0, 0) hasta que llega el primer `mousemove` de la lista.
                  x.jump(e.clientX + 28);
                  y.jump(e.clientY - 96);
                  if (hovered === null) {
                    sx.jump(e.clientX + 28);
                    sy.jump(e.clientY - 96);
                  }
                  setHovered(remate);
                }}
              >
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  onFocus={() => setHovered(remate)}
                  onBlur={() => setHovered(null)}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid-cols-[9rem_minmax(0,1fr)_12rem_5rem_auto]"
                >
                  <span className="order-2 text-sm md:order-none">
                    {remate.status === 'live' ? (
                      <span className="inline-flex items-center gap-2 font-medium text-success-700">
                        <LiveDot /> En vivo
                      </span>
                    ) : (
                      <span className="tabular-nums text-ink-muted">
                        <span className="capitalize">{formatDay(remate.startsAt).split(' ')[0]}</span> {formatHour(remate.startsAt)}
                      </span>
                    )}
                  </span>
                  <span className="order-1 col-span-2 min-w-0 md:order-none md:col-span-1">
                    <span className="block truncate text-xl font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
                      {remate.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
                      <Icon className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                      {CATEGORY_SHORT[remate.category]}
                      {remate.auctionType === 'timed' && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                          <Timer className="h-3 w-3" aria-hidden="true" /> Timed
                        </span>
                      )}
                    </span>
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
        </AnimatePresence>
      </ul>

      {rows.length === 0 && (
        <p className="py-14 text-center text-ink-muted">
          No hay remates para esa búsqueda. Probá con otro día o borrá el texto.
        </p>
      )}

      {/* Foto flotante que sigue al cursor -- solo con mouse (md+), decorativa. */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="preview"
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-30 hidden h-44 w-60 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/5 md:block"
            style={{ x: sx, y: sy }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
          >
            <RemateThumb remate={hovered} className="h-full w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function DayChip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-xl border px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        selected ? 'border-ink bg-ink text-white [&_.text-ink-muted]:text-white/70' : 'border-line bg-white hover:border-ink-faint'
      }`}
    >
      {children}
    </button>
  );
}
