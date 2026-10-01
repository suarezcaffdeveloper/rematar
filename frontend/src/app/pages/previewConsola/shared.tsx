import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Check, ChevronDown, Copy, Gavel, Lock, Send, ShieldAlert, X } from 'lucide-react';
import { formatCurrency } from '../../../shared/lib/format';
import { YouTubeMark } from '../../../features/rematador/components/YouTubeMark';
import { MOCK_REMATE, type MockLote } from './mockData';
import type { AdjudicatedInfo, ConsolaSim, MockChatMessage, ToastMessage } from './useConsolaSim';

export type Tone = 'light' | 'dark';

/* ------------------------------------------------------------------ formatos */

export const money = (amount: number) => formatCurrency(String(amount), MOCK_REMATE.currency);

export function clock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const hhmmss = (ms: number) => timeFormatter.format(new Date(ms));

export function ago(seconds: number): string {
  if (seconds < 60) return `hace ${seconds} s`;
  return `hace ${Math.floor(seconds / 60)} min`;
}

/* ------------------------------------------------------------- tonos de color */

export const T = {
  light: {
    text: 'text-ink',
    muted: 'text-ink-muted',
    faint: 'text-ink-faint',
    line: 'border-line',
    lineStrong: 'border-line-strong',
    divide: 'divide-line',
    surface: 'bg-white',
    subtle: 'bg-surface-subtle',
    hover: 'hover:bg-surface-subtle',
    input: 'border-line bg-white text-ink placeholder:text-ink-faint focus:border-ink',
    leader: 'bg-success-50 text-success-700',
    pill: 'bg-surface-subtle text-ink-muted',
    tabActive: 'border-ink text-ink',
    tabIdle: 'border-transparent text-ink-muted hover:text-ink',
    ownMsg: 'bg-brand-50 text-brand-700',
  },
  dark: {
    text: 'text-white',
    muted: 'text-white/65',
    faint: 'text-white/40',
    line: 'border-white/10',
    lineStrong: 'border-white/20',
    divide: 'divide-white/10',
    surface: 'bg-white/[0.04]',
    subtle: 'bg-white/[0.06]',
    hover: 'hover:bg-white/[0.07]',
    input: 'border-white/15 bg-white/[0.06] text-white placeholder:text-white/35 focus:border-white/60',
    leader: 'bg-success-500/20 text-success-400',
    pill: 'bg-white/10 text-white/70',
    tabActive: 'border-white text-white',
    tabIdle: 'border-transparent text-white/55 hover:text-white',
    ownMsg: 'bg-brand-500/25 text-brand-50',
  },
} as const;

/* --------------------------------------------------------------------- galería */

/** Foto principal con miniaturas debajo: cambia la principal al elegir una. */
export function Gallery({ lote, tone = 'light', className = '' }: { lote: MockLote; tone?: Tone; className?: string }) {
  const [index, setIndex] = useState(0);
  const t = T[tone];
  const images = lote.images;
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-ink">
        <img src={images[index]} alt={lote.title} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink backdrop-blur">
          {index + 1} / {images.length}
        </span>
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2">
          {images.map((url, i) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-pressed={i === index}
                className={`block h-14 w-20 overflow-hidden rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  i === index ? (tone === 'dark' ? 'border-white' : 'border-ink') : `${t.line} opacity-70 hover:opacity-100`
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FichaTecnica({ lote, tone = 'light', columns = 'sm:grid-cols-3' }: { lote: MockLote; tone?: Tone; columns?: string }) {
  const t = T[tone];
  const entries = Object.entries(lote.attributes);
  if (entries.length === 0 && !lote.quantity) return null;
  return (
    <section aria-label="Ficha técnica">
      <h3 className={`text-sm font-semibold ${t.text}`}>Ficha técnica</h3>
      <dl className={`mt-3 grid grid-cols-2 gap-x-6 gap-y-3 ${columns}`}>
        {lote.quantity && (
          <div>
            <dt className={`text-xs ${t.faint}`}>Cantidad</dt>
            <dd className={`text-sm font-medium ${t.text}`}>{lote.quantity}</dd>
          </div>
        )}
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className={`text-xs ${t.faint}`}>{key}</dt>
            <dd className={`text-sm font-medium ${t.text}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------------- ofertas */

/** Ofertas recientes: monto en mono, hora, y la primera marcada como líder. */
export function OfferList({ sim, tone = 'light', className = '' }: { sim: ConsolaSim; tone?: Tone; className?: string }) {
  const t = T[tone];
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex shrink-0 items-baseline justify-between">
        <h2 className={`text-base font-semibold tracking-tight ${t.text}`}>Ofertas recientes</h2>
        <span className={`text-sm tabular-nums ${t.muted}`}>{sim.offers.length}</span>
      </div>
      {sim.offers.length === 0 ? (
        <p className={`mt-3 text-sm ${t.muted}`}>Todavía no hay ofertas en este lote.</p>
      ) : (
        <ul className={`mt-2 min-h-0 flex-1 divide-y overflow-y-auto pr-1 ${t.divide} ${tone === 'dark' ? '[color-scheme:dark]' : ''}`}>
          <AnimatePresence initial={false}>
            {sim.offers.slice(0, 12).map((offer) => (
              <motion.li
                key={offer.id}
                layout="position"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className={`font-mono text-sm font-semibold tabular-nums ${offer.leading ? t.text : t.muted}`}>
                    {money(offer.amount)}
                  </p>
                  <p className={`text-xs tabular-nums ${t.faint}`}>{hhmmss(offer.at)}</p>
                </div>
                {offer.leading ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.leader}`}>
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Líder
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.pill}`}>Superada</span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ chat */

type RailTab = 'chat' | 'conectados' | 'moderacion';
const RAIL_TABS: Array<{ id: RailTab; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'conectados', label: 'Conectados' },
  { id: 'moderacion', label: 'Moderación' },
];

const MODERATION_LOG = [
  { id: 1, text: 'Comprador 44 silenciado por 5 min', at: '14:31:02' },
  { id: 2, text: 'Mensaje de Comprador 09 eliminado', at: '14:12:40' },
];

/** Chat, conectados y moderación en un único panel con pestañas (como `ConsolaSidebar`). */
export function ChatPanel({ sim, tone = 'light', className = '' }: { sim: ConsolaSim; tone?: Tone; className?: string }) {
  const t = T[tone];
  const [tab, setTab] = useState<RailTab>('chat');
  const [draft, setDraft] = useState('');
  const [locked, setLocked] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el && tab === 'chat') el.scrollTop = el.scrollHeight;
  }, [sim.chat.length, tab]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div role="tablist" aria-label="Panel lateral" className={`flex shrink-0 gap-5 border-b ${t.line}`}>
        {RAIL_TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              tab === item.id ? t.tabActive : t.tabIdle
            }`}
          >
            {item.label}
            {item.id === 'conectados' && <span className={`ml-1.5 text-xs tabular-nums ${t.faint}`}>{sim.connected}</span>}
          </button>
        ))}
      </div>

      {tab === 'chat' && (
        <>
          <ul ref={listRef} className={`mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 ${tone === 'dark' ? '[color-scheme:dark]' : ''}`} aria-live="polite">
            {sim.chat.map((message) => (
              <ChatBubble key={message.id} message={message} tone={tone} />
            ))}
          </ul>
          <form
            className="mt-3 flex shrink-0 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sim.sendChat(draft);
              setDraft('');
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={locked}
              aria-label="Mensaje al chat"
              placeholder={locked ? 'El chat está bloqueado' : 'Escribí un mensaje'}
              className={`min-w-0 flex-1 rounded-full border px-4 py-2.5 text-sm outline-none transition-colors disabled:opacity-60 ${t.input}`}
            />
            <button
              type="submit"
              disabled={!draft.trim() || locked}
              aria-label="Enviar mensaje"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </>
      )}

      {tab === 'conectados' && (
        <ul className={`mt-3 min-h-0 flex-1 divide-y overflow-y-auto ${t.divide}`}>
          {sim.buyers.concat(['Comprador 03', 'Comprador 66', 'Comprador 71', 'Comprador 22']).map((name, i) => (
            <li key={name} className="flex items-center justify-between py-2.5 text-sm">
              <span className={`font-medium ${t.text}`}>{name}</span>
              <span className={`text-xs tabular-nums ${t.faint}`}>entró hace {6 + i * 9} min</span>
            </li>
          ))}
          <li className={`py-3 text-xs ${t.faint}`}>Mostrando 10 de {sim.connected} conectados.</li>
        </ul>
      )}

      {tab === 'moderacion' && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${t.line} ${t.surface}`}>
            <span className={`flex items-center gap-2 text-sm font-semibold ${t.text}`}>
              <ShieldAlert className={`h-4 w-4 ${t.faint}`} aria-hidden="true" />
              {locked ? 'Chat bloqueado' : 'Chat abierto'}
            </span>
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                tone === 'dark'
                  ? 'border-white/20 text-white hover:bg-white/10'
                  : 'border-line-strong text-ink hover:bg-surface-subtle'
              }`}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {locked ? 'Desbloquear' : 'Bloquear chat'}
            </button>
          </div>
          <div>
            <h3 className={`text-sm font-semibold ${t.text}`}>Acciones recientes</h3>
            <ul className={`mt-2 divide-y ${t.divide}`}>
              {MODERATION_LOG.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className={t.muted}>{entry.text}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${t.faint}`}>{entry.at}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ message, tone }: { message: MockChatMessage; tone: Tone }) {
  const t = T[tone];
  return (
    <li className="text-sm leading-snug">
      <p className="flex items-baseline gap-2">
        <span className={`font-semibold ${message.fromOperator ? (tone === 'dark' ? 'text-brand-50' : 'text-brand-700') : t.text}`}>
          {message.author}
        </span>
        <span className={`text-xs tabular-nums ${t.faint}`}>{hhmmss(message.at).slice(0, 5)}</span>
      </p>
      <p className={`mt-0.5 ${message.fromOperator ? `inline-block rounded-2xl px-3 py-1.5 ${t.ownMsg}` : t.muted}`}>{message.text}</p>
    </li>
  );
}

/* ------------------------------------------------- Transmisión y Martillero */

type QuickId = 'stream' | 'operator';

/** Los dos botones plegables de la consola ("Transmisión" y "Martillero") con su popover. */
export function QuickPanels({ tone = 'light' }: { tone?: Tone }) {
  const [open, setOpen] = useState<QuickId | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const wrapRef = useRef<HTMLDivElement>(null);
  const dark = tone === 'dark';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function copy(label: string, value: string) {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const trigger = (id: QuickId, icon: ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setOpen((cur) => (cur === id ? null : id))}
      aria-expanded={open === id}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        open === id
          ? dark
            ? 'border-white bg-white text-ink'
            : 'border-ink bg-ink text-white'
          : dark
            ? 'border-white/20 text-white hover:bg-white/10'
            : 'border-line-strong text-ink hover:bg-surface-subtle'
      }`}
    >
      {icon}
      {label}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === id ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  );

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      {trigger('stream', <YouTubeMark size={18} />, 'Transmisión')}
      {trigger('operator', <Gavel className="h-4 w-4" aria-hidden="true" />, 'Martillero')}

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-5 text-ink shadow-2xl ring-1 ring-black/5">
          {open === 'stream' ? (
            <>
              <h3 className="text-base font-semibold tracking-tight">Transmisión en vivo</h3>
              <p className="mt-1 text-sm text-ink-muted">Pegá el link del video de YouTube que ven los compradores en la sala.</p>
              <label htmlFor="pv-stream" className="mt-4 block text-sm font-medium">
                Link de YouTube
              </label>
              <input
                id="pv-stream"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 w-full border-b-2 border-line-strong bg-transparent py-2 text-sm outline-none focus:border-ink"
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-success-700">
                  <span className="h-2 w-2 rounded-full bg-success-500" aria-hidden="true" /> Transmitiendo
                </span>
                <button type="button" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85">
                  Guardar
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold tracking-tight">Datos para el martillero</h3>
              <p className="mt-1 text-sm text-ink-muted">Compartí estos datos con quien va a operar el remate.</p>
              {[
                ['ID del remate', MOCK_REMATE.remateId],
                ['Código de operador', MOCK_REMATE.operatorId],
              ].map(([label, value]) => (
                <div key={label} className="mt-4 flex items-end justify-between gap-3 border-b border-line pb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-faint">{label}</p>
                    <p className="truncate font-mono text-sm font-semibold">{value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(label, value)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-surface-subtle"
                  >
                    {copied === label ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    {copied === label ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ diálogos, avisos y selector */

export function ConfirmDialog({ sim }: { sim: ConsolaSim }) {
  const kind = sim.pendingConfirm;
  const copy = {
    pause: {
      title: 'Pausar remate',
      message: `¿Pausar "${MOCK_REMATE.title}"? Los compradores no van a poder ofertar hasta que lo reanudes.`,
      confirm: 'Pausar',
      danger: false,
    },
    finish: {
      title: 'Finalizar remate',
      message: `¿Finalizar "${MOCK_REMATE.title}"? Esta acción no se puede deshacer.`,
      confirm: 'Finalizar',
      danger: true,
    },
    'recent-offer': {
      title: 'Oferta reciente',
      message: `Se recibió una oferta recientemente. Última oferta ${ago(sim.secondsSinceLastOffer ?? 0)}. ¿Querés adjudicar igualmente el lote?`,
      confirm: 'Adjudicar igual',
      danger: false,
    },
  } as const;
  const current = kind ? copy[kind] : null;

  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sim.setPendingConfirm(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [kind, sim]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pv-confirm-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="w-full max-w-md rounded-2xl bg-white p-7 text-ink shadow-2xl"
          >
            <h2 id="pv-confirm-title" className="text-2xl font-semibold tracking-tight">
              {current.title}
            </h2>
            <p className="mt-2 text-ink-muted">{current.message}</p>
            <div className="mt-7 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => sim.setPendingConfirm(null)}
                className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                onClick={sim.confirm}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                  current.danger ? 'bg-danger-600 hover:bg-danger-500' : 'bg-ink hover:bg-ink/85'
                }`}
              >
                {current.confirm}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Cartel de "lote adjudicado" con el acceso rápido al siguiente lote. */
export function AdjudicatedOverlay({ sim }: { sim: ConsolaSim }) {
  const info: AdjudicatedInfo | null = sim.adjudicated;
  const canAdvance = sim.upcoming.length > 0;
  return (
    <AnimatePresence>
      {info && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pv-adj-title"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg rounded-2xl bg-white p-8 text-ink shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500 text-white">
              <Check className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 id="pv-adj-title" className="mt-5 text-3xl font-semibold tracking-tight">
              Lote {info.number} adjudicado
            </h2>
            <p className="mt-1 text-ink-muted">{info.title}</p>
            <p className="mt-5 font-mono text-5xl font-semibold tabular-nums tracking-tight">{money(info.price)}</p>
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                autoFocus
                disabled={!canAdvance}
                onClick={() => {
                  sim.dismissAdjudicated();
                  sim.openNext();
                }}
                className="rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line-strong"
              >
                Pasar al siguiente lote
              </button>
              <button
                type="button"
                onClick={sim.dismissAdjudicated}
                className="rounded-full border border-line-strong px-6 py-3 font-semibold hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" role="status">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.p
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-xl ${
              toast.tone === 'success' ? 'bg-ink' : 'bg-danger-600'
            }`}
          >
            {toast.tone === 'success' ? <Check className="h-4 w-4 text-success-400" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
            {toast.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Selector flotante de la vista previa (no forma parte del diseño). */
export function PreviewSwitch({ current, onReset }: { current: 'a' | 'a2' | 'b'; onReset: () => void }) {
  const base = 'rounded-full px-4 py-2 text-sm font-medium transition-colors';
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink p-1 shadow-xl ring-1 ring-white/20">
      <Link to="/preview-consola-a" className={`${base} ${current === 'a' ? 'bg-white text-ink' : 'text-white/70 hover:text-white'}`}>
        Opción A
      </Link>
      <Link to="/preview-consola-a2" className={`${base} ${current === 'a2' ? 'bg-white text-ink' : 'text-white/70 hover:text-white'}`}>
        A revisada
      </Link>
      <Link to="/preview-consola-b" className={`${base} ${current === 'b' ? 'bg-white text-ink' : 'text-white/70 hover:text-white'}`}>
        Opción B
      </Link>
      <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
      <button type="button" onClick={onReset} className={`${base} text-white/70 hover:text-white`}>
        Reiniciar
      </button>
    </div>
  );
}
