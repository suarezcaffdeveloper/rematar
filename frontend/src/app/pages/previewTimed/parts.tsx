import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ArrowUp, ChevronLeft, ChevronRight, Clock3, ShieldCheck, Trophy } from 'lucide-react';
import { formatCurrency } from '../../../shared/lib/format';
import type { Lote } from '../../../features/remates/types';
import { photoPosition, type SimOffer, type TimedSim } from './sim';

export const money = (n: number | string) => formatCurrency(String(n), 'ARS');

/** Reloj de 1 s compartido: los componentes que muestran tiempo se actualizan juntos. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export interface TimeLeft {
  ms: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Menos de 5 minutos. */
  urgent: boolean;
  /** Menos de 1 hora. */
  soon: boolean;
  ended: boolean;
}

export function timeLeft(lote: Lote, now: number): TimeLeft | null {
  if (lote.status !== 'open' || lote.timer_ends_at === null) return null;
  const ms = Math.max(0, new Date(lote.timer_ends_at).getTime() - now);
  const total = Math.floor(ms / 1000);
  return {
    ms,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    urgent: ms <= 5 * 60 * 1000,
    soon: ms <= 60 * 60 * 1000,
    ended: ms === 0,
  };
}

/** "2 d 3 h", "3 h 10 min", "52 min", "4:20" -- lo justo para escanear una lista. */
export function compactTime(t: TimeLeft | null): string | null {
  if (!t) return null;
  if (t.ended) return 'Cerrando';
  if (t.days > 0) return `${t.days} d ${t.hours} h`;
  if (t.hours > 0) return `${t.hours} h ${t.minutes} min`;
  if (t.minutes >= 5) return `${t.minutes} min`;
  return `${t.minutes}:${String(t.seconds).padStart(2, '0')}`;
}

export function relativeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'recién';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Cronómetro grande del lote: cuatro segmentos, rojo cuando quedan menos de 5 minutos. */
export function Clock({ lote, extended = false, compact = false }: { lote: Lote; extended?: boolean; compact?: boolean }) {
  const now = useNow();
  const t = timeLeft(lote, now);
  if (!t) return null;
  const segments = [
    { label: 'días', value: t.days, show: t.days > 0 },
    { label: 'horas', value: t.hours, show: t.days > 0 || t.hours > 0 },
    { label: 'min', value: t.minutes, show: true },
    { label: 'seg', value: t.seconds, show: true },
  ].filter((s) => s.show);
  return (
    <div
      role="timer"
      aria-label="Tiempo restante para ofertar en este lote"
      className={clsx(
        'rounded-xl border px-4 transition-colors',
        compact ? 'py-2.5' : 'py-3.5',
        t.urgent ? 'border-danger-200 bg-danger-50' : 'border-line bg-surface-subtle',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={clsx('flex items-center gap-1.5 text-xs font-semibold', t.urgent ? 'text-danger-600' : 'text-ink-muted')}>
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
          {t.urgent ? 'Está por cerrar' : 'Cierra en'}
        </p>
        {extended && (
          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700">
            +1 min por oferta final
          </span>
        )}
      </div>
      <div className={clsx('mt-1.5 flex items-end gap-3 font-mono tabular-nums', t.urgent ? 'text-danger-600' : 'text-ink')}>
        {segments.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1">
            <span className={clsx('font-extrabold leading-none', compact ? 'text-2xl' : 'text-[32px]')}>
              {String(s.value).padStart(2, '0')}
            </span>
            <span className="font-display text-[11px] font-medium text-ink-faint">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Una línea de tiempo para filas y mosaicos: rojo si es inminente. */
export function TimeChip({ lote, className = '' }: { lote: Lote; className?: string }) {
  const now = useNow();
  const t = timeLeft(lote, now);
  const label = compactTime(t);
  if (!t || !label) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums',
        t.urgent ? 'text-danger-600' : t.soon ? 'text-warning-700' : 'text-ink-muted',
        className,
      )}
    >
      <Clock3 aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Estado del comprador en un lote: lo que más le importa ver de un vistazo. */
export function MineTag({ sim, lote }: { sim: TimedSim; lote: Lote }) {
  if (lote.status !== 'open' || !sim.hasBid(lote.id)) return null;
  const leading = sim.isLeading(lote.id);
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        leading ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
      )}
    >
      {leading ? <Trophy aria-hidden="true" className="h-3 w-3" /> : <ArrowUp aria-hidden="true" className="h-3 w-3" />}
      {leading ? 'Vas liderando' : 'Te superaron'}
    </span>
  );
}

/** Precio que se muestra de un lote según su estado. */
export function priceOf(sim: TimedSim, lote: Lote): { label: string; value: string; tone: string } {
  const leading = sim.leadingAmounts[lote.id];
  if (lote.status === 'closed_sold')
    return { label: 'Vendido', value: money(lote.final_price ?? lote.base_price), tone: 'text-ink' };
  if (lote.status === 'closed_unsold') return { label: 'Cierre', value: 'Sin ofertas', tone: 'text-ink-faint' };
  if (lote.status === 'pending') return { label: 'Base', value: money(lote.base_price), tone: 'text-ink' };
  if (leading !== null && leading !== undefined) return { label: 'Oferta actual', value: money(leading), tone: 'text-ink' };
  return { label: 'Base', value: money(lote.base_price), tone: 'text-ink' };
}

/** Galería de un lote: foto grande con flechas y tira de miniaturas. */
export function Gallery({ lote, aspect = 'aspect-[4/3]' }: { lote: Lote; aspect?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [lote.id]);
  const images = lote.images;
  const count = images.length;
  const go = (next: number) => setIndex((next + count) % count);
  return (
    <div>
      <div className={clsx('group relative overflow-hidden rounded-xl bg-surface-subtle', aspect)}>
        <motion.img
          key={`${lote.id}-${index}`}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          src={images[index]?.url}
          alt={`${lote.title}, foto ${index + 1} de ${count}`}
          className="h-full w-full object-cover"
          style={{ objectPosition: photoPosition(index) }}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => go(index - 1)}
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Foto siguiente"
              onClick={() => go(index + 1)}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1} de {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Fotos del lote">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={clsx(
                'h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border-2 transition',
                i === index ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <img src={img.url} alt="" className="h-full w-full object-cover" style={{ objectPosition: photoPosition(i) }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Descripción con "Ver más" cuando es larga. */
export function Description({ text, lines = 4 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [text]);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [text, open]);
  return (
    <div>
      <p
        ref={ref}
        style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        className="whitespace-pre-line text-[15px] leading-relaxed text-ink-muted"
      >
        {text}
      </p>
      {(overflowing || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {open ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

/** Ofertas recientes: cuatro a la vista, el resto con scroll interno. */
export function RecentOffers({
  offers,
  loteKey,
  incomingId,
  visibleRows = 4,
}: {
  offers: SimOffer[];
  loteKey: string;
  incomingId: string | null;
  visibleRows?: number;
}) {
  const now = useNow();
  const sorted = useMemo(() => [...offers].sort((a, b) => b.amount - a.amount), [offers]);
  return (
    <section aria-label="Ofertas recientes">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Ofertas recientes</h3>
        <span className="text-xs text-ink-faint">{sorted.length === 1 ? '1 oferta' : `${sorted.length} ofertas`}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface-subtle px-3 py-4 text-center text-sm text-ink-muted">
          Todavía nadie ofertó. La primera oferta puede ser desde la base.
        </p>
      ) : (
        <ul
          key={loteKey}
          className="mt-2 divide-y divide-line overflow-y-auto overscroll-contain"
          style={{ maxHeight: `${visibleRows * 3.35}rem` }}
        >
          {sorted.map((o, i) => (
            <motion.li
              key={o.id}
              initial={o.id === incomingId || o.mine ? { opacity: 0, backgroundColor: 'rgba(219,234,254,0.8)' } : false}
              animate={{ opacity: 1, backgroundColor: 'rgba(255,255,255,0)' }}
              transition={{ duration: 1.2 }}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className={clsx('font-mono tabular-nums', i === 0 ? 'text-lg font-bold text-ink' : 'text-sm text-ink-muted')}>
                  {money(o.amount)}
                </p>
                <p className="truncate text-xs text-ink-faint">
                  {o.mine ? 'Vos' : o.bidder} · {relativeAgo(o.at, now)}
                </p>
              </div>
              {i === 0 ? (
                <span
                  className={clsx(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                    o.mine ? 'bg-success-50 text-success-700' : 'bg-brand-50 text-brand-700',
                  )}
                >
                  <Trophy aria-hidden="true" className="h-3 w-3" />
                  {o.mine ? 'Vas liderando' : 'Ganadora'}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-ink-faint">{o.mine ? 'Tu oferta, superada' : 'Superada'}</span>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Precio + formulario de oferta con todos los estados del comprador. */
export function BidPanel({
  sim,
  lote,
  onBuildGuarantee,
  priceSize = 'text-[44px]',
}: {
  sim: TimedSim;
  lote: Lote;
  onBuildGuarantee: () => void;
  priceSize?: string;
}) {
  const current = sim.leadingAmounts[lote.id];
  const minimum = sim.minimumFor(lote);
  const increment = Number(lote.min_increment);
  const leading = sim.isLeading(lote.id);
  const outbid = sim.hasBid(lote.id) && !leading;
  const isOpen = lote.status === 'open';
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [forceForm, setForceForm] = useState(false);
  const [bump, setBump] = useState<number | null>(null);
  const prev = useRef({ id: lote.id, amount: current ?? Number(lote.base_price) });

  useEffect(() => {
    setValue('');
    setError(null);
    setSent(false);
    setForceForm(false);
  }, [lote.id]);

  // El precio sube por una oferta ajena o propia en el mismo lote: destello + "+$ X".
  useEffect(() => {
    const now = current ?? Number(lote.base_price);
    const before = prev.current;
    prev.current = { id: lote.id, amount: now };
    if (before.id !== lote.id || now <= before.amount) {
      setBump(null);
      return;
    }
    setBump(now - before.amount);
    const id = window.setTimeout(() => setBump(null), 2600);
    return () => window.clearTimeout(id);
  }, [lote.id, lote.base_price, current]);

  const submit = (event: FormEvent, amount?: number) => {
    event.preventDefault();
    const parsed = amount ?? Number(value.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < minimum) {
      setError(`La oferta mínima es ${money(minimum)}.`);
      return;
    }
    sim.placeBid(lote.id, parsed);
    setValue('');
    setError(null);
    setSent(true);
    setForceForm(false);
    window.setTimeout(() => setSent(false), 3200);
  };

  const suggestions = [minimum, minimum + increment * 2, minimum + increment * 5];
  const showForm = isOpen && (!leading || forceForm);

  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        {isOpen && <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />}
        {lote.status === 'closed_sold'
          ? 'Precio final'
          : lote.status === 'closed_unsold'
            ? 'Cierre'
            : current !== null && current !== undefined
              ? 'Oferta actual'
              : 'Precio base'}
      </p>
      <p
        className={clsx(
          'mt-1 font-mono font-extrabold leading-none tabular-nums tracking-tight text-ink',
          priceSize,
          bump !== null && 'animate-price-flash',
        )}
      >
        {lote.status === 'closed_unsold'
          ? 'Sin ofertas'
          : money(lote.final_price ?? current ?? lote.base_price)}
      </p>
      <div className="mt-2 flex min-h-7 items-center">
        {bump !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
            <ArrowUp aria-hidden="true" className="h-3 w-3" />+{money(bump)} desde la última oferta
          </span>
        ) : (
          <p className="text-xs text-ink-faint">
            Base {money(lote.base_price)} · cada oferta suma al menos {money(increment)}
          </p>
        )}
      </div>

      {lote.status === 'pending' && (
        <p className="mt-4 rounded-lg bg-surface-subtle px-4 py-3 text-sm text-ink-muted">
          Este lote todavía no abrió. Cuando abra, vas a poder ofertar desde {money(lote.base_price)}.
        </p>
      )}
      {lote.status === 'closed_sold' && (
        <p className="mt-4 rounded-lg bg-surface-subtle px-4 py-3 text-sm text-ink-muted">
          Este lote ya se vendió. No se aceptan más ofertas.
        </p>
      )}
      {lote.status === 'closed_unsold' && (
        <p className="mt-4 rounded-lg bg-surface-subtle px-4 py-3 text-sm text-ink-muted">
          Este lote cerró sin ofertas.
        </p>
      )}

      {isOpen && sim.viewer === 'anonimo' && (
        <div className="mt-4 rounded-lg border border-line bg-surface-subtle p-4">
          <p className="text-sm text-ink-muted">Ingresá a tu cuenta para ofertar en este lote.</p>
          <button
            type="button"
            className="mt-3 w-full rounded-lg bg-ink py-3 text-sm font-semibold text-white transition hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Ingresar para ofertar
          </button>
        </div>
      )}

      {isOpen && sim.viewer === 'garantia' && (
        <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-4">
          <p className="flex items-start gap-2 text-sm text-warning-700">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Este remate pide una garantía de {money(500000)} antes de ofertar. Se bloquea en tu tarjeta y se libera al terminar.
          </p>
          <button
            type="button"
            onClick={onBuildGuarantee}
            className="mt-3 w-full rounded-lg bg-warning-500 py-3 text-sm font-semibold text-ink transition hover:bg-warning-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Construir garantía
          </button>
        </div>
      )}

      {isOpen && (sim.viewer === 'normal' || sim.viewer === 'lider') && (
        <div className="mt-4">
          {sent && (
            <p role="status" className="mb-3 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
              Oferta enviada. Vas liderando este lote.
            </p>
          )}
          {outbid && !sent && (
            <p role="status" className="mb-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
              Te superaron en este lote. Para volver a liderar, ofertá {money(minimum)} o más.
            </p>
          )}
          {leading && !forceForm && (
            <div className="rounded-lg border border-success-200 bg-success-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-success-700">
                <Trophy aria-hidden="true" className="h-4 w-4" />
                Vas liderando este lote
              </p>
              <p className="mt-1 text-sm text-success-700">
                Si nadie te supera antes del cierre, te lo adjudicás.
              </p>
              <button
                type="button"
                onClick={() => setForceForm(true)}
                className="mt-2 text-sm font-semibold text-success-700 underline-offset-2 hover:underline"
              >
                Ofertar de todos modos
              </button>
            </div>
          )}
          {showForm && (
            <form onSubmit={submit} noValidate>
              <label htmlFor={`bid-${lote.id}`} className="flex items-baseline justify-between text-sm font-medium text-ink">
                Tu oferta
                <span className="font-mono text-xs font-normal text-ink-faint">Mínimo: {money(minimum)}</span>
              </label>
              <div className="mt-1.5 flex items-center rounded-lg border border-line-strong bg-white px-3 focus-within:border-ink focus-within:ring-2 focus-within:ring-brand-200">
                <span className="font-mono text-ink-faint">$</span>
                <input
                  id={`bid-${lote.id}`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  placeholder={minimum.toLocaleString('es-AR')}
                  aria-invalid={error !== null}
                  className="w-full bg-transparent px-2 py-3 font-mono text-lg tabular-nums text-ink placeholder:text-ink-faint focus:outline-none"
                />
              </div>
              {error && (
                <p role="alert" className="mt-1.5 text-sm text-danger-600">
                  {error}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={(e) => submit(e, s)}
                    className="rounded-full border border-line px-3 py-1.5 font-mono text-xs font-medium tabular-nums text-ink-muted transition hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    {money(s)}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="mt-4 w-full rounded-lg bg-brand-600 py-3.5 text-base font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Ofertar
              </button>
              <p className="mt-2 text-center text-xs text-ink-faint">
                Si ofertás en el último minuto, el lote suma 1 minuto más para que todos puedan responder.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Modal mínimo para que el botón "Construir garantía" haga algo visible en la maqueta. */
export function GuaranteeStub({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Construir garantía"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink">Construir garantía</h2>
        <p className="mt-2 text-sm text-ink-muted">
          En la sala real acá se abre el formulario de tarjeta. En esta vista previa no hay cobro ni bloqueo.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-ink py-3 text-sm font-semibold text-white"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
