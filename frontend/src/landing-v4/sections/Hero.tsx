import { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Gavel } from 'lucide-react';
import { HERO_LOTS } from '../data';
import { AnchorLink, EASE, EASE_OUT, formatUsd, INTRO_S, PrimaryCta, SplitHeading } from '../lib';

const TICK_MS = 1300;
const SOLD_TICKS = 3;
const BUYERS = ['#214', '#087', '#133', '#052'];
const YOU = 'Vos';
const HISTORY = 12;

interface Bid {
  id: number;
  buyer: string;
  amount: number;
}

interface AuctionState {
  lot: number;
  price: number;
  leader: string;
  idle: number;
  sold: boolean;
  soldTicks: number;
  botsLeft: number;
  nextId: number;
  /** Más reciente primero. */
  bids: Bid[];
}

type AuctionAction = { type: 'tick'; roll: number } | { type: 'bid' };

function freshLot(lot: number, nextId: number): AuctionState {
  return { lot, price: HERO_LOTS[lot].start, leader: '', idle: 0, sold: false, soldTicks: 0, botsLeft: 4, nextId, bids: [] };
}

function pushBid(state: AuctionState, buyer: string): AuctionState {
  const amount = state.price + HERO_LOTS[state.lot].step;
  return {
    ...state,
    price: amount,
    leader: buyer,
    idle: 0,
    nextId: state.nextId + 1,
    bids: [{ id: state.nextId, buyer, amount }, ...state.bids].slice(0, HISTORY),
  };
}

/**
 * Subasta simulada del hero. Imita el ritmo de un remate en vivo: la oferta sube hasta que nadie
 * más ofrece y el martillero canta "a la una… a las dos…" antes de adjudicar. Las ofertas del
 * visitante cuentan: el cantado se reinicia y alguien puede mejorarlas.
 */
function auctionReducer(state: AuctionState, action: AuctionAction): AuctionState {
  if (action.type === 'bid') {
    if (state.sold) return state;
    return { ...pushBid(state, YOU), botsLeft: Math.min(state.botsLeft + 1, 3) };
  }
  if (state.sold) {
    if (state.soldTicks + 1 >= SOLD_TICKS) return freshLot((state.lot + 1) % HERO_LOTS.length, state.nextId);
    return { ...state, soldTicks: state.soldTicks + 1 };
  }
  if (state.botsLeft > 0 && action.roll < 0.78) {
    const rivals = BUYERS.filter((candidate) => candidate !== state.leader);
    const buyer = rivals[state.nextId % rivals.length];
    return { ...pushBid(state, buyer), botsLeft: state.botsLeft - 1 };
  }
  const idle = state.idle + 1;
  return idle >= 3 ? { ...state, idle, sold: true } : { ...state, idle };
}

const CALLS = ['Oferta vigente', 'A la una…', 'A las dos…'];

/** Precio con dígitos que ruedan: cada columna 0–9 se desplaza con la curva del sistema. */
function RollingPrice({ value, tone }: { value: number; tone: 'live' | 'sold' }) {
  const chars = value.toLocaleString('es-AR').split('');
  return (
    <span
      className={`lv4-serif lv4-num inline-flex items-baseline transition-colors duration-700 ${tone === 'sold' ? 'text-[var(--lv4-brass)]' : 'text-white'}`}
      aria-label={formatUsd(value)}
    >
      <span aria-hidden="true" className="mr-2 font-[Geist] text-[0.3em] font-normal tracking-normal text-white/55">
        US$
      </span>
      {chars.map((char, index) => {
        const fromRight = chars.length - 1 - index;
        if (!/\d/.test(char)) {
          return (
            <span key={`sep-${fromRight}`} aria-hidden="true" className="inline-block w-[0.2em] text-center">
              {char}
            </span>
          );
        }
        return (
          <span key={`d-${fromRight}`} aria-hidden="true" className="relative inline-block h-[1em] w-[0.47em] overflow-hidden text-center leading-none">
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[900ms] [transition-timing-function:var(--lv4-ease)]"
              style={{ transform: `translateY(${-Number(char)}em)` }}
            >
              {Array.from({ length: 10 }, (_, digit) => (
                <span key={digit} className="block h-[1em] leading-none">
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Historial de ofertas del lote como columnas que crecen: la última queda destacada. */
function BidBars({ bids, start, step }: { bids: Bid[]; start: number; step: number }) {
  const ordered = [...bids].reverse();
  const last = ordered[ordered.length - 1];
  const top = Math.max(last?.amount ?? start, start + step * 6);
  return (
    <div className="flex h-12 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: HISTORY }, (_, index) => {
        const bid = ordered[index - (HISTORY - ordered.length)];
        const ratio = bid ? Math.max(0.12, (bid.amount - start) / (top - start)) : 0.06;
        const latest = bid !== undefined && bid === last;
        return (
          <span
            key={index}
            className={`block h-full flex-1 origin-bottom transition-[transform,background-color] duration-700 [transition-timing-function:var(--lv4-ease)] ${
              latest ? 'bg-[var(--lv4-cobalt-soft)]' : bid ? 'bg-white/35' : 'bg-white/10'
            }`}
            style={{ transform: `scaleY(${ratio})` }}
          />
        );
      })}
    </div>
  );
}

function LiveHud({ state, dispatch }: { state: AuctionState; dispatch: (action: AuctionAction) => void }) {
  const lot = HERO_LOTS[state.lot];
  const next = state.price + lot.step;
  const youLead = state.leader === YOU;
  const youWon = state.sold && youLead;
  const call = state.sold ? (youWon ? 'Adjudicado a vos' : `Adjudicado a ${state.leader}`) : CALLS[Math.min(state.idle, 2)];

  return (
    <div
      key={state.sold ? `sold-${state.lot}` : 'live'}
      className={`relative border border-white/15 bg-[var(--lv4-ink)]/60 p-5 backdrop-blur-md sm:p-6 ${state.sold ? 'lv4-strike' : ''}`}
    >
      {state.sold && (
        <span
          aria-hidden="true"
          className="lv4-shockwave pointer-events-none absolute left-1/2 top-1/2 block aspect-square w-[130%] rounded-full border border-[var(--lv4-brass)]/60"
        />
      )}
      <div className="flex items-center justify-between text-[13px] text-white/65">
        <span className="flex items-center gap-2.5">
          <span className="lv4-live-dot relative block h-1.5 w-1.5 rounded-full bg-rose-500 text-rose-500" />
          Remate en vivo
        </span>
        <span>{lot.rubro}</span>
      </div>

      <p className="mt-6 text-[13px] text-white/55">Oferta actual</p>
      <div className="mt-1 text-[3.6rem] leading-none sm:text-[4.4rem]">
        <RollingPrice value={state.price} tone={state.sold ? 'sold' : 'live'} />
      </div>
      <p className="mt-3 h-5 text-[13px] text-white/65">
        {state.leader ? (youLead ? 'Tu oferta va primera' : `Lidera el comprador ${state.leader}`) : 'Esperando la primera oferta'}
      </p>

      <div className="mt-5">
        <BidBars bids={state.bids} start={lot.start} step={lot.step} />
      </div>

      <div className="mt-5 flex items-center gap-3 border-y border-white/12 py-3.5">
        <Gavel className="h-[17px] w-[17px] shrink-0 text-white/60" strokeWidth={1.25} aria-hidden="true" />
        <div className="relative h-5 flex-1 overflow-hidden text-[14px] leading-5" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={call}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className={`absolute inset-0 ${state.sold ? 'text-[var(--lv4-brass)]' : state.idle > 0 ? 'text-white' : 'text-white/80'}`}
            >
              {call}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <button
        type="button"
        disabled={state.sold}
        onClick={() => dispatch({ type: 'bid' })}
        className="lv4-btn mt-5 flex h-[3.25rem] w-full items-center justify-between rounded-[2px] border border-white bg-white px-5 text-[14.5px] font-medium text-[var(--lv4-ink)] [--lv4-fill:var(--lv4-cobalt)] hover:border-[var(--lv4-cobalt)] hover:text-white disabled:border-white/15 disabled:bg-transparent disabled:text-white/40"
      >
        <span>{state.sold ? 'Preparando el próximo lote' : 'Ofertar'}</span>
        <span className="lv4-num">{state.sold ? '' : formatUsd(next)}</span>
      </button>
    </div>
  );
}

const HEADLINE = ['El remate,', 'en tiempo real.'];
const LEDE =
  'Organizá, conducí y participá de remates online de forma segura y profesional. Cada puja llega a todos en el mismo instante.';

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [state, dispatch] = useReducer(auctionReducer, undefined, () => freshLot(0, 0));
  const lot = HERO_LOTS[state.lot];
  const [lotLabel, ...detailParts] = lot.detalle.split(' · ');
  const detail = detailParts.join(' · ');

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const photoY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '16%']);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: 'tick', roll: Math.random() }), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const base = reduce ? 0 : INTRO_S - 0.5;

  return (
    <section id="inicio" ref={ref} className="lv4-dark relative isolate min-h-[100dvh] overflow-hidden">
      <motion.div style={{ y: photoY }} className="absolute inset-0 -z-10">
        <AnimatePresence initial={false}>
          <motion.img
            key={lot.key}
            src={lot.photo.url}
            alt={lot.photo.alt}
            initial={{ opacity: 0, scale: 1.16 }}
            animate={{ opacity: 1, scale: 1.02 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.6, ease: EASE }, scale: { duration: 16, ease: 'linear' } }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--lv4-ink)] via-[var(--lv4-ink)]/45 to-[var(--lv4-ink)]/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--lv4-ink)]/80 via-[var(--lv4-ink)]/20 to-transparent" />
        <div className="lv4-vignette absolute inset-0" />
      </motion.div>

      {state.sold && <div key={`flash-${state.lot}`} aria-hidden="true" className="lv4-flash pointer-events-none absolute inset-0 -z-[5] bg-white" />}

      <motion.div
        style={{ y: copyY, opacity: copyOpacity }}
        className="mx-auto flex min-h-[100dvh] w-full max-w-[90rem] flex-col justify-between px-5 pb-12 pt-28 sm:px-8 lg:px-14 lg:pb-16"
      >
        {/* Cartela de catálogo del lote que se está rematando. */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: base + 0.9 }} className="hidden md:block">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={lot.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="max-w-xs border-l border-white/40 pl-4"
            >
              <p className="lv4-serif text-[1.6rem] italic leading-none text-white/90">{lotLabel}</p>
              <p className="mt-2 text-[15px] font-medium text-white">{lot.lote}</p>
              <p className="mt-0.5 text-[13px] text-white/60">{detail}</p>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <div className="mt-24 grid items-end gap-12 lg:mt-0 lg:grid-cols-[1.4fr_0.6fr] lg:gap-16">
          <div>
            <SplitHeading
              as="h1"
              immediate
              lines={HEADLINE}
              delay={base}
              stagger={0.14}
              className="lv4-serif text-[clamp(3.6rem,10vw,9.8rem)] leading-[0.9] text-white"
            />
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: EASE, delay: base + 0.7 }}
              className="mt-8 max-w-[31rem] text-[17px] leading-relaxed text-white/75"
            >
              {LEDE}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: EASE, delay: base + 0.85 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <PrimaryCta tone="light" />
              <AnchorLink href="#como-funciona" label="Cómo funciona" tone="ghostLight" />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.3, ease: EASE, delay: base + 0.6 }}
            className="w-full max-w-[26rem] lg:ml-auto"
          >
            <LiveHud state={state} dispatch={dispatch} />
            <p className="mt-3 text-[13px] text-white/50">Es una demo. Tocá “Ofertar” y mirá cómo reacciona la sala.</p>
          </motion.div>
        </div>
      </motion.div>

      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 hidden h-16 w-px -translate-x-1/2 overflow-hidden lg:block">
        <span className="lv4-cue block h-full w-px bg-white/60" />
      </div>
    </section>
  );
}
