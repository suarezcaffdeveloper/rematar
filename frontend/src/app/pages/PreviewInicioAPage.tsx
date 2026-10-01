import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Pause, Play, Timer, Users } from 'lucide-react';
import { CATEGORY_ICONS, CATEGORY_SHORT, LiveDot, RemateThumb, formatHour, formatMonthShort, formatWeekdayShort, money, sameDay } from './previewInicio/shared';
import { ALL_MOCK_REMATES, LIVE_REMATES, SCHEDULED_REMATES, useLiveBids, type LiveBidState, type MockRemate } from './previewInicio/mockRemates';

const STAGE_SECONDS = 9;

/**
 * Vista previa A del inicio del comprador: "escenario + agenda". Arriba, un escenario
 * oscuro a sangre donde el remate en vivo activo ocupa todo el alto (foto que respira,
 * oferta subiendo en tiempo real) y los demás esperan en una cola lateral que avanza sola
 * con una barra de progreso. Abajo no hay grilla de tarjetas: los remates programados se
 * leen como una agenda agrupada por día, y los rubros como un ranking con barras.
 * Datos de prueba, sin backend -- ver `previewInicio/mockRemates.ts`.
 */
export function PreviewInicioAPage() {
  return (
    <div className="min-h-screen bg-surface-subtle font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-1 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Remates disponibles</h1>
            <p className="mt-1.5 text-ink-muted">Lo que está pasando ahora y lo que viene esta semana.</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <LiveDot />
            <span>
              <strong className="font-semibold text-ink">{LIVE_REMATES.length} en vivo</strong> y{' '}
              {SCHEDULED_REMATES.length} programados
            </span>
          </p>
        </header>

        <BidTicker />
        <LiveStage />

        <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
          <Agenda />
          <Rubros />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cinta de ofertas */

const TICKER_ITEMS = [
  { remate: 'Hacienda Angus', text: 'Lote 12 sube a', amount: 1_900_000 },
  { remate: 'Flota corporativa', text: 'Lote 7 sube a', amount: 31_400_000 },
  { remate: 'Maquinaria vial', text: 'Lote 3 se adjudicó en', amount: 58_500_000 },
  { remate: 'Fin de cosecha', text: 'Lote 18 sube a', amount: 41_250_000 },
  { remate: 'Sucesión Recoleta', text: 'Lote 20 se adjudicó en', amount: 780_000 },
  { remate: 'Hacienda Angus', text: 'Lote 11 se adjudicó en', amount: 1_750_000 },
];

function BidTicker() {
  return (
    <div
      className="relative mb-3 overflow-hidden border-y border-line py-2.5 text-sm"
      style={{ maskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)' }}
      aria-label="Últimas ofertas"
      role="marquee"
    >
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-10" aria-hidden={copy === 1}>
            {TICKER_ITEMS.map((item) => (
              <span key={item.remate + item.text} className="flex items-center gap-2 text-ink-muted">
                <span className="font-medium text-ink">{item.remate}</span>
                {item.text}
                <span className="font-semibold tabular-nums text-success-600">{money(item.amount)}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- escenario */

function LiveStage() {
  const reduceMotion = useReducedMotion();
  const bids = useLiveBids(LIVE_REMATES);
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const paused = hovering || userPaused;
  const remate = LIVE_REMATES[active];

  const next = () => setActive((i) => (i + 1) % LIVE_REMATES.length);

  return (
    <section
      aria-label="Remates en vivo"
      className="grid overflow-hidden rounded-2xl bg-ink text-white shadow-xl lg:h-[37rem] lg:grid-cols-[minmax(0,1fr)_21rem]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <div className="relative h-[30rem] overflow-hidden lg:h-auto">
        <AnimatePresence initial={false}>
          <motion.img
            key={remate.id}
            src={remate.image ?? ''}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: remate.imagePosition }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: reduceMotion ? 1 : 1.08 }}
            exit={{ opacity: 0, transition: { duration: 0.9 } }}
            transition={{ opacity: { duration: 0.9 }, scale: { duration: STAGE_SECONDS + 2, ease: 'linear' } }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-transparent" />

        <motion.div
          key={remate.id}
          className="absolute inset-x-0 bottom-0 flex flex-col gap-5 p-5 sm:p-9"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="flex items-center gap-3 text-sm text-white/80">
            <span className="inline-flex items-center gap-2 rounded-full bg-success-500/20 px-3 py-1 font-medium text-success-200 backdrop-blur">
              <LiveDot /> En vivo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden="true" />
              {remate.connected} conectados
            </span>
            <span className="hidden sm:inline">{remate.location}</span>
          </p>

          <h2 className="max-w-3xl text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            {remate.title}
          </h2>

          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <div>
              <p className="text-sm text-white/65">
                Lote {remate.currentLot?.number} en el martillo: {remate.currentLot?.title}
              </p>
              <BidAmount state={bids[remate.id]} />
            </div>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-ink transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Entrar a la sala
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col border-t border-white/10 bg-white/[0.04] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h3 className="text-sm font-semibold text-white/90">Ahora en vivo</h3>
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? 'Reanudar rotación automática' : 'Pausar rotación automática'}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {userPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        <ul className="flex flex-1 gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {LIVE_REMATES.map((item, i) => {
            const isActive = i === active;
            return (
              <li key={item.id} className="min-w-[17rem] lg:min-w-0 lg:flex-1">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={isActive}
                  className={`relative flex h-full w-full items-center gap-3 overflow-hidden rounded-xl p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    isActive ? 'bg-white/12' : 'hover:bg-white/[0.07]'
                  }`}
                >
                  <RemateThumb remate={item} className="h-14 w-14 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className={`line-clamp-2 text-sm font-medium leading-snug ${isActive ? 'text-white' : 'text-white/75'}`}>
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs tabular-nums text-white/50">{money(bids[item.id].bid)}</span>
                  </span>
                  {isActive && !reduceMotion && (
                    <span className="absolute inset-x-2.5 bottom-0 h-0.5 bg-white/15">
                      <span
                        key={`${item.id}-${userPaused}`}
                        className="block h-full w-full animate-stage-progress bg-white"
                        style={
                          {
                            '--stage-duration': `${STAGE_SECONDS}s`,
                            animationPlayState: paused ? 'paused' : 'running',
                          } as React.CSSProperties
                        }
                        onAnimationEnd={next}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function BidAmount({ state }: { state: LiveBidState }) {
  return (
    <p className="mt-1 flex items-baseline gap-3">
      <motion.span
        key={state.bump}
        className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl"
        initial={state.bump === 0 ? false : { color: '#86efac', y: -6 }}
        animate={{ color: '#ffffff', y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        {money(state.bid)}
      </motion.span>
      <span className="text-sm text-white/55">oferta actual</span>
    </p>
  );
}

/* ----------------------------------------------------------------------- agenda */

function Agenda() {
  const days = useMemo(() => {
    const sorted = [...SCHEDULED_REMATES].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const groups: { date: Date; items: MockRemate[] }[] = [];
    for (const remate of sorted) {
      const last = groups[groups.length - 1];
      if (last && sameDay(last.date, remate.startsAt)) last.items.push(remate);
      else groups.push({ date: remate.startsAt, items: [remate] });
    }
    return groups;
  }, []);

  return (
    <section aria-labelledby="agenda-title">
      <h2 id="agenda-title" className="text-2xl font-semibold tracking-tight">
        Próximos remates
      </h2>
      <p className="mt-1 text-ink-muted">Ordenados por día. Entrá cuando arrancan o dejá tus ofertas antes.</p>

      <div className="mt-8 flex flex-col gap-10">
        {days.map(({ date, items }) => (
          <div key={date.toDateString()} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-x-8">
            <div className="sticky top-4 self-start pt-4">
              <p className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">{date.getDate()}</p>
              <p className="mt-2 text-sm text-ink-muted">
                {formatWeekdayShort(date)}, {formatMonthShort(date)}
              </p>
            </div>
            <ul className="border-t border-ink">
              {items.map((remate) => (
                <AgendaRow key={remate.id} remate={remate} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgendaRow({ remate }: { remate: MockRemate }) {
  const Icon = CATEGORY_ICONS[remate.category];
  return (
    <li className="border-b border-line">
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="group -mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-6"
      >
        <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-ink-muted sm:w-16">{formatHour(remate.startsAt)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-medium leading-snug sm:text-xl">{remate.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon className="h-4 w-4 text-ink-faint" aria-hidden="true" />
              {CATEGORY_SHORT[remate.category]}
            </span>
            <span>{remate.location}</span>
            <span>{remate.lotes} lotes</span>
            {remate.auctionType === 'timed' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                <Timer className="h-3 w-3" aria-hidden="true" /> Timed
              </span>
            )}
          </span>
        </span>
        <RemateThumb remate={remate} className="hidden h-14 w-20 shrink-0 rounded-md sm:block" />
        <ArrowUpRight
          className="h-5 w-5 shrink-0 text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
          aria-hidden="true"
        />
      </a>
    </li>
  );
}

/* ------------------------------------------------------------------------ rubros */

function Rubros() {
  const rows = useMemo(() => {
    const counts = new Map<MockRemate['category'], number>();
    for (const r of ALL_MOCK_REMATES) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, []);
  const max = rows[0]?.[1] ?? 1;

  return (
    <aside aria-labelledby="rubros-title" className="lg:pt-0">
      <h2 id="rubros-title" className="text-2xl font-semibold tracking-tight">
        Por rubro
      </h2>
      <p className="mt-1 text-ink-muted">Cuántos remates hay abiertos en cada uno.</p>
      <ul className="mt-8 flex flex-col">
        {rows.map(([category, count], i) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <li key={category} className="border-t border-line first:border-ink">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="group flex items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Icon className="h-5 w-5 shrink-0 text-ink-faint transition-colors group-hover:text-brand-600" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{CATEGORY_SHORT[category]}</span>
                    <span className="text-sm font-semibold tabular-nums">{count}</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                    <motion.span
                      className="block h-full rounded-full bg-ink transition-colors group-hover:bg-brand-600"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(count / max) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
