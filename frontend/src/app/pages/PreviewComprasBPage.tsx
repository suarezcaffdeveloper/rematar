import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Search, X } from 'lucide-react';
import { STATUS_ORDER } from '../../features/postauction/labels';
import type { PostAuctionCaseDetail } from '../../features/postauction/types';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import {
  COMPRAS,
  COMPRAS_GROUPS,
  CompraThumb,
  CountUp,
  STATUS_LABELS,
  formatShortDate,
  groupOf,
  money,
  nextStep,
  statusTone,
} from './previewCompras/shared';

/**
 * Vista previa B de "Mis compras": "tablero". Las compras se ordenan en cuatro columnas
 * según la etapa del proceso (por coordinar, para pagar, en camino, recibidas), cada una
 * con su cantidad y monto; la de "para pagar" se resalta porque es la única que espera una
 * acción del comprador. Tocar una compra abre un panel lateral con el detalle rápido y el
 * recorrido paso a paso, sin salir de la página. Datos de prueba con el tipo real
 * `PostAuctionCaseDetail`, sin backend.
 */
export function PreviewComprasBPage() {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PostAuctionCaseDetail | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMPRAS.filter(
      (c) => !q || c.lote_title.toLowerCase().includes(q) || c.remate_title.toLowerCase().includes(q),
    );
  }, [query]);

  const invested = COMPRAS.reduce((sum, c) => sum + Number(c.final_price), 0);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="compras" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Tus compras, etapa por etapa
            </h1>
            <p className="mt-3 max-w-md text-ink-muted">
              Tocá una compra para ver en qué está y qué sigue.
            </p>
          </div>
          <div className="flex flex-col gap-5 lg:items-end">
            <p className="lg:text-right">
              <span className="block text-4xl font-semibold tracking-tight sm:text-5xl">
                <CountUp value={invested} format={(n) => money(Math.round(n))} />
              </span>
              <span className="text-sm text-ink-muted">invertido en {COMPRAS.length} compras</span>
            </p>
            <label className="relative block w-full lg:w-80">
              <span className="sr-only">Buscar en mis compras</span>
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por lote o remate"
                className="w-full border-b border-line-strong bg-transparent py-2 pl-7 pr-2 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
              />
            </label>
          </div>
        </header>

        <section aria-label="Compras por etapa" className="grid gap-y-10 border-t border-ink lg:grid-cols-4 lg:gap-y-0 pb-20">
          {COMPRAS_GROUPS.map((group, columnIndex) => {
            const items = filtered.filter((c) => groupOf(c.status) === group.id);
            const total = items.reduce((sum, c) => sum + Number(c.final_price), 0);
            const isAction = group.id === 'pagar';
            return (
              <div
                key={group.id}
                className={`flex min-w-0 flex-col lg:border-l lg:border-line lg:first:border-l-0 ${
                  isAction ? 'bg-brand-50/60' : ''
                }`}
              >
                <div className="px-0 pb-4 pt-5 lg:px-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">{group.label}</h2>
                    <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight">{items.length}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {items.length === 0 ? 'Nada por acá' : isAction ? `${money(total)} por pagar` : money(total)}
                  </p>
                </div>

                <ul className="flex-1 border-t border-line lg:px-2">
                  {items.map((compra, i) => (
                    <motion.li
                      key={compra.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 * columnIndex + 0.05 * i }}
                      className="border-b border-line last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(compra)}
                        aria-haspopup="dialog"
                        className="group flex w-full items-start gap-3 rounded-xl px-3 py-4 text-left transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <CompraThumb
                          compra={compra}
                          className="h-14 w-14 shrink-0 rounded-lg transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 font-medium leading-snug">{compra.lote_title}</span>
                          <span className="mt-0.5 block truncate text-xs text-ink-muted">{compra.remate_title}</span>
                          <span className="mt-2 flex items-baseline justify-between gap-2">
                            <span className={`text-xs font-medium ${statusTone(compra.status)}`}>
                              {STATUS_LABELS[compra.status]}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">{money(compra.final_price)}</span>
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      <QuickView compra={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ----------------------------------------------------------------- panel lateral */

const STEP_DATE: Partial<Record<(typeof STATUS_ORDER)[number], keyof PostAuctionCaseDetail>> = {
  adjudicado: 'created_at',
  pendiente_contacto: 'contacted_at',
  pago_recibido: 'payment_at',
  enviado: 'shipped_at',
  entregado: 'delivered_at',
  finalizado: 'finalized_at',
};

function QuickView({ compra, onClose }: { compra: PostAuctionCaseDetail | null; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!compra) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [compra, onClose]);

  return (
    <AnimatePresence>
      {compra && (
        <>
          <motion.div
            key="backdrop"
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de ${compra.lote_title}`}
            className="fixed right-0 top-0 z-50 flex h-full w-[min(30rem,100vw)] flex-col overflow-y-auto bg-white shadow-2xl"
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
          >
            <div className="relative h-56 shrink-0 bg-surface-subtle">
              <CompraThumb compra={compra} className="h-full w-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/50 to-transparent" />
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Cerrar detalle"
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-7 p-6 sm:p-8">
              <div>
                <p className={`text-sm font-medium ${statusTone(compra.status)}`}>{STATUS_LABELS[compra.status]}</p>
                <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{compra.lote_title}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Lote {compra.lot_number} del remate {compra.remate_title}
                </p>
              </div>

              <div className="flex items-end justify-between gap-4 border-y border-line py-5">
                <div>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight">{money(compra.final_price)}</p>
                  <p className="mt-1 text-sm text-ink-muted">precio final, base {money(compra.base_price)}</p>
                </div>
                <p className="text-right text-sm text-ink-muted">
                  Martillero
                  <span className="block font-medium text-ink">{compra.rematador_name}</span>
                </p>
              </div>

              <p className="border-l-2 border-brand-600 pl-4 text-sm leading-relaxed text-ink-muted">
                {compra.status === 'pago_pendiente' && <strong className="font-semibold text-ink">Te toca a vos. </strong>}
                {nextStep(compra)}
              </p>

              <ol aria-label="Recorrido de la compra" className="flex flex-col">
                {STATUS_ORDER.map((step, i) => {
                  const index = STATUS_ORDER.indexOf(compra.status);
                  const done = i < index;
                  const current = i === index;
                  const dateKey = STEP_DATE[step];
                  const date = dateKey ? (compra[dateKey] as string | null) : null;
                  return (
                    <li key={step} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span
                          aria-current={current ? 'step' : undefined}
                          className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                            done
                              ? 'border-ink bg-ink'
                              : current
                                ? 'border-brand-600 bg-brand-600 ring-4 ring-brand-100'
                                : 'border-line-strong bg-white'
                          }`}
                        />
                        {i < STATUS_ORDER.length - 1 && (
                          <span className={`my-1 w-0.5 flex-1 rounded-full ${done ? 'bg-ink' : 'bg-line'}`} />
                        )}
                      </div>
                      <div className="flex flex-1 items-baseline justify-between gap-3 pb-4">
                        <span className={`text-sm ${current ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-ink-faint'}`}>
                          {STATUS_LABELS[step]}
                        </span>
                        {date && (done || current) && (
                          <span className="text-xs tabular-nums text-ink-muted">{formatShortDate(date)}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="group mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Ver compra completa
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </a>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
