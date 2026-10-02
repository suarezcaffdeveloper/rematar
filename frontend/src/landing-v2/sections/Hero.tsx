import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import { BadgeCheck, Check } from 'lucide-react';
import { HERO_LOTS } from '../data';
import { AnchorLink, EASE, formatUsd, PrimaryCta } from '../lib';

const BIDS_PER_LOT = 6;
const TICK_MS = 1400;
const HAMMER_PAUSE_MS = 900;
const SOLD_MS = 2800;
const BUYERS = ['#214', '#087', '#133', '#052'];
const HEADLINE = ['Remates en vivo,', 'con toda la sala', 'al mismo tiempo.'];
const TICKER = [...HERO_LOTS, ...HERO_LOTS];

interface AuctionState {
  lot: number;
  bids: number;
  sold: boolean;
}

/**
 * Subasta simulada que gobierna todo el hero: la oferta sube sola hasta que cae el martillo
 * ("Adjudicado" + destello), y recién ahí cambia el lote y la fotografía. Es el momento
 * orquestado de la página; el resto del movimiento responde al scroll o al cursor.
 */
function useHeroAuction(paused: boolean) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<AuctionState>({ lot: 0, bids: 0, sold: false });

  useEffect(() => {
    if (paused || reduceMotion) return;
    const waiting = state.sold ? SOLD_MS : state.bids >= BIDS_PER_LOT ? HAMMER_PAUSE_MS : TICK_MS;
    const id = window.setTimeout(() => {
      setState((current) => {
        if (current.sold) return { lot: (current.lot + 1) % HERO_LOTS.length, bids: 0, sold: false };
        if (current.bids >= BIDS_PER_LOT) return { ...current, sold: true };
        return { ...current, bids: current.bids + 1 };
      });
    }, waiting);
    return () => window.clearTimeout(id);
  }, [state, paused, reduceMotion]);

  return [state, (lot: number) => setState({ lot, bids: 0, sold: false })] as const;
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [auction, select] = useHeroAuction(paused);
  const lot = HERO_LOTS[auction.lot];
  const price = lot.start + lot.step * auction.bids;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const photoY = useTransform(scrollYProgress, [0, 1], ['0%', '16%']);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  const recentBids = [0, 1, 2]
    .map((back) => auction.bids - back)
    .filter((bid) => bid >= 0)
    .map((bid) => ({ bid, buyer: BUYERS[bid % BUYERS.length], amount: lot.start + lot.step * bid }));

  return (
    <section
      id="inicio"
      ref={ref}
      className="lv2-grain lv2-night relative isolate flex min-h-[100svh] flex-col overflow-hidden text-white"
    >
      {/* Fotografía: cada lote trae la suya, con zoom lento (Ken Burns) y parallax al scrollear. */}
      <motion.div className="absolute inset-0 -z-20" style={{ y: reduceMotion ? 0 : photoY }}>
        <AnimatePresence mode="sync">
          <motion.div
            key={lot.key}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          >
            <motion.img
              src={lot.photo.url}
              alt=""
              className="h-full w-full object-cover"
              initial={{ scale: 1.04 }}
              animate={{ scale: reduceMotion ? 1.04 : 1.16 }}
              transition={{ duration: 12, ease: 'linear' }}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[var(--lv2-night)]/90 via-[var(--lv2-night)]/45 to-[var(--lv2-night)]/20" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[var(--lv2-night)] via-transparent to-[var(--lv2-night)]/60" />

      {/* Destello del martillo: un fogonazo breve cuando se adjudica el lote. */}
      <AnimatePresence>
        {auction.sold && (
          <motion.div
            key={`flash-${lot.key}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-white"
            initial={{ opacity: 0.32 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <motion.div
        style={{ y: reduceMotion ? 0 : contentY, opacity: reduceMotion ? 1 : contentOpacity }}
        className="relative mx-auto flex w-full max-w-[96rem] flex-1 flex-col justify-end gap-10 px-5 pb-8 pt-32 sm:px-8 lg:grid lg:grid-cols-[1fr_25rem] lg:items-end lg:gap-14 lg:px-12 lg:pb-10"
      >
        <div>
          <h1 className="lv2-serif text-[clamp(2.9rem,7.4vw,7.4rem)] font-light leading-[0.96] tracking-[-0.025em]">
            {HEADLINE.map((line, index) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  className="block"
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 1.1, ease: EASE, delay: 0.25 + index * 0.12 }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.85 }}
            className="mt-7 max-w-xl text-[17px] leading-relaxed text-white/75"
          >
            RematAR reúne a la empresa, al martillero y a los compradores en un mismo remate: ofertas que
            se actualizan al instante, una consola para conducir la sala y seguimiento hasta la entrega.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <PrimaryCta />
            <AnchorLink href="#plataforma">Ver la plataforma</AnchorLink>
            <a
              href="/demo.html"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-[15px] font-medium text-white/75 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
            >
              Probar la demo
            </a>
          </motion.div>
        </div>

        {/* Lote en el martillo */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.9 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="w-full rounded-3xl bg-white/[0.08] p-5 ring-1 ring-white/20 backdrop-blur-2xl lg:max-w-none"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] text-white/60">{lot.detalle}</p>
              <p className="mt-1 truncate text-lg font-semibold">{lot.lote}</p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              {auction.sold ? (
                <motion.span
                  key="sold"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-500 px-2.5 py-1 text-xs font-semibold text-white"
                >
                  <Check className="h-3.5 w-3.5" /> Adjudicado
                </motion.span>
              ) : (
                <motion.span
                  key="live"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-semibold"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  En el martillo
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div>
              <p className="text-[13px] text-white/60">{auction.sold ? 'Precio de martillo' : 'Oferta vigente'}</p>
              <motion.p
                key={`${lot.key}-${auction.bids}-${auction.sold}`}
                initial={auction.bids > 0 && !auction.sold ? { color: '#86efac', scale: 1.04 } : false}
                animate={{ color: auction.sold ? '#86efac' : '#ffffff', scale: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="mt-0.5 origin-left text-[2.6rem] font-semibold leading-none tabular-nums tracking-tight"
              >
                {formatUsd(price)}
              </motion.p>
            </div>
            <p className="pb-1 text-sm tabular-nums text-white/70">{7 + auction.bids} ofertas</p>
          </div>

          <ul className="mt-5 space-y-1.5 border-t border-white/15 pt-4" aria-label="Últimas ofertas">
            <AnimatePresence initial={false} mode="popLayout">
              {recentBids.map(({ bid, buyer, amount }, index) => (
                <motion.li
                  key={`${lot.key}-${bid}`}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1 - index * 0.3, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span className="text-white/65">Comprador {buyer}</span>
                  <span className="tabular-nums text-white">{formatUsd(amount)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      </motion.div>

      {/* Rubros: elegir uno reinicia el remate en ese lote. */}
      <div className="relative mx-auto w-full max-w-[96rem] px-5 pb-6 sm:px-8 lg:px-12">
        <div className="flex gap-2" role="tablist" aria-label="Lotes de ejemplo">
          {HERO_LOTS.map((item, index) => {
            const active = index === auction.lot;
            const fill = active ? (auction.bids + (auction.sold ? 1 : 0)) / (BIDS_PER_LOT + 1) : index < auction.lot ? 1 : 0;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => select(index)}
                className="group flex-1 text-left"
              >
                <span className="block h-[3px] overflow-hidden rounded-full bg-white/25">
                  <span
                    className="block h-full origin-left rounded-full bg-white transition-transform duration-[1400ms] ease-linear"
                    style={{ transform: `scaleX(${fill})` }}
                  />
                </span>
                <span
                  className={`mt-2.5 block truncate text-xs transition-colors ${
                    active ? 'font-semibold text-white' : 'text-white/50 group-hover:text-white/80'
                  }`}
                >
                  {item.rubro}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cinta de adjudicados */}
      <div className="relative overflow-hidden border-t border-white/15 bg-[var(--lv2-night)]/60 py-3.5 backdrop-blur-md" aria-hidden="true">
        <div className="animate-marquee flex w-max items-center gap-12 whitespace-nowrap text-[13px]">
          {TICKER.map((item, index) => (
            <span key={`${item.key}-${index}`} className="inline-flex items-center gap-2.5 text-white/70">
              <BadgeCheck className="h-4 w-4 text-success-400" />
              <span className="text-white/45">Adjudicado</span>
              <span className="font-medium text-white">{item.lote}</span>
              <span className="tabular-nums text-white/90">{formatUsd(item.vendido)}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
