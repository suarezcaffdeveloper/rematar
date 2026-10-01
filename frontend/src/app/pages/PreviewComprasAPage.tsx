import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { STATUS_ORDER } from '../../features/postauction/labels';
import type { PostAuctionCaseDetail, PostAuctionStatus } from '../../features/postauction/types';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import { TopFocus, TopPanorama } from './previewCompras/TopVariants';
import {
  COMPRAS,
  COMPRAS_GROUPS,
  CompraThumb,
  STATUS_LABELS,
  formatShortDate,
  groupOf,
  money,
  nextStep,
  statusTone,
  type ComprasGroupId,
} from './previewCompras/shared';

const DONE: PostAuctionStatus[] = ['entregado', 'finalizado'];

/**
 * Vista previa A de "Mis compras": "seguimiento". Cada compra en proceso es una fila
 * editorial con su foto y una línea de 8 pasos que se llena hasta la etapa en la que está,
 * con el "qué sigue" en texto claro. Lo que ya llegó pasa a un índice compacto (mismo
 * lenguaje que "Todos los remates" del inicio, con la foto flotando al pasar el mouse).
 * Datos de prueba con el tipo real `PostAuctionCaseDetail`, sin backend.
 *
 * La zona superior (antes titular con contador + tres cifras) tiene dos propuestas
 * alternativas en `previewCompras/TopVariants.tsx`: `?arriba=1` y `?arriba=2`.
 */
export function PreviewComprasAPage() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ComprasGroupId | 'all'>('all');
  const [searchParams] = useSearchParams();
  const topVariant = searchParams.get('arriba');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMPRAS.filter(
      (c) =>
        (group === 'all' || groupOf(c.status) === group) &&
        (!q || c.lote_title.toLowerCase().includes(q) || c.remate_title.toLowerCase().includes(q)),
    );
  }, [query, group]);

  // Lo que espera algo del comprador primero, después lo más reciente.
  const inProgress = useMemo(
    () =>
      filtered
        .filter((c) => !DONE.includes(c.status))
        .sort(
          (a, b) =>
            Number(b.status === 'pago_pendiente') - Number(a.status === 'pago_pendiente') ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    [filtered],
  );
  const received = useMemo(() => filtered.filter((c) => DONE.includes(c.status)), [filtered]);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="compras" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        {/* Zona superior: dos opciones, `?arriba=1` (próximo paso, por defecto) o
         * `?arriba=2` (panorama). Todo lo que sigue -- filtros y listados -- es común. */}
        <div className="mb-12">
          {topVariant === '2' ? (
            <TopPanorama compras={COMPRAS} group={group} onGroup={setGroup} />
          ) : (
            <TopFocus compras={COMPRAS} group={group} onGroup={setGroup} />
          )}
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por etapa">
            <GroupChip selected={group === 'all'} onClick={() => setGroup('all')}>
              Todas <span className="tabular-nums opacity-60">{COMPRAS.length}</span>
            </GroupChip>
            {COMPRAS_GROUPS.map((g) => (
              <GroupChip key={g.id} selected={group === g.id} onClick={() => setGroup(g.id)}>
                {g.label}{' '}
                <span className="tabular-nums opacity-60">{COMPRAS.filter((c) => groupOf(c.status) === g.id).length}</span>
              </GroupChip>
            ))}
          </div>
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

        {filtered.length === 0 && (
          <p className="py-20 text-center text-ink-muted">
            No hay compras para esa búsqueda. Probá con otra etapa o borrá el texto.
          </p>
        )}

        {inProgress.length > 0 && (
          <section aria-labelledby="proceso-title" className="mt-12">
            <h2 id="proceso-title" className="mb-6 text-2xl font-semibold tracking-tight">
              En proceso
            </h2>
            <ul className="border-t border-ink">
              {inProgress.map((compra) => (
                <ActiveRow key={compra.id} compra={compra} />
              ))}
            </ul>
          </section>
        )}

        {received.length > 0 && <ReceivedIndex compras={received} />}
      </div>
    </div>
  );
}

function GroupChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
        selected ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink-faint'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ en proceso */

function ActiveRow({ compra }: { compra: PostAuctionCaseDetail }) {
  const needsPayment = compra.status === 'pago_pendiente';
  return (
    <li className="border-b border-line py-8">
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_14rem] lg:gap-10">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          tabIndex={-1}
          aria-hidden="true"
          className="group block h-48 overflow-hidden rounded-xl bg-surface-subtle lg:h-44"
        >
          <CompraThumb
            compra={compra}
            className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </a>

        <div className="min-w-0">
          <p className={`text-sm font-medium ${statusTone(compra.status)}`}>{STATUS_LABELS[compra.status]}</p>
          <h3 className="mt-1 text-2xl font-medium leading-snug tracking-tight sm:text-3xl">{compra.lote_title}</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Lote {compra.lot_number} del remate {compra.remate_title}
          </p>
          <div className="mt-6">
            <ProcessTrack status={compra.status} />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-muted">
            {needsPayment && <strong className="font-semibold text-ink">Te toca a vos. </strong>}
            {nextStep(compra)}
          </p>
        </div>

        <div className="flex flex-row items-end justify-between gap-4 lg:flex-col lg:items-end lg:justify-between lg:text-right">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{money(compra.final_price)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              base {money(compra.base_price)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">adjudicado el {formatShortDate(compra.created_at)}</p>
          </div>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className={`group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              needsPayment ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-ink text-white hover:bg-ink/85'
            }`}
          >
            Ver compra
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </a>
        </div>
      </div>
    </li>
  );
}

/** Los 8 pasos del proceso en una línea: lo hecho en tinta, el paso actual en color y lo
 * que falta vacío. La línea se llena hasta el paso actual cuando la fila entra en pantalla. */
function ProcessTrack({ status }: { status: PostAuctionStatus }) {
  const reduceMotion = useReducedMotion();
  const index = STATUS_ORDER.indexOf(status);
  const last = STATUS_ORDER.length - 1;
  const currentTone = status === 'pago_pendiente' ? 'border-warning-500 bg-warning-500 ring-warning-100' : 'border-brand-600 bg-brand-600 ring-brand-100';

  return (
    <div>
      <div className="relative">
        <div className="absolute left-[6.25%] right-[6.25%] top-[7px] h-0.5 rounded-full bg-line" aria-hidden="true" />
        <motion.div
          aria-hidden="true"
          className="absolute left-[6.25%] top-[7px] h-0.5 origin-left rounded-full bg-ink"
          style={{ width: '87.5%' }}
          initial={reduceMotion ? false : { scaleX: 0 }}
          whileInView={{ scaleX: index / last }}
          animate={reduceMotion ? { scaleX: index / last } : undefined}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
        <ol aria-label="Progreso de la compra" className="relative grid grid-cols-8">
          {STATUS_ORDER.map((step, i) => (
            <li key={step} className="flex flex-col items-center gap-2">
              <span
                aria-current={i === index ? 'step' : undefined}
                className={`h-4 w-4 rounded-full border-2 ${
                  i < index
                    ? 'border-ink bg-ink'
                    : i === index
                      ? `ring-4 ${currentTone}`
                      : 'border-line-strong bg-white'
                }`}
              />
              <span
                className={`hidden text-center text-[11px] leading-tight lg:block ${
                  i === index ? 'font-semibold text-ink' : 'text-ink-faint'
                }`}
              >
                {STATUS_LABELS[step]}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-sm text-ink-muted lg:hidden">
        Paso {index + 1} de {STATUS_ORDER.length}: {STATUS_LABELS[status]}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- recibidas */

function ReceivedIndex({ compras }: { compras: PostAuctionCaseDetail[] }) {
  const [hovered, setHovered] = useState<PostAuctionCaseDetail | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 32, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 320, damping: 32, mass: 0.6 });

  return (
    <section aria-labelledby="recibidas-title" className="mt-16 pb-16">
      <h2 id="recibidas-title" className="mb-6 text-2xl font-semibold tracking-tight">
        Recibidas
      </h2>
      <ul
        className="border-t border-ink"
        onMouseMove={(e) => {
          x.set(e.clientX + 28);
          y.set(e.clientY - 96);
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {compras.map((compra) => {
          const dimmed = hovered !== null && hovered.id !== compra.id;
          return (
            <motion.li
              key={compra.id}
              initial={false}
              animate={{ opacity: dimmed ? 0.35 : 1 }}
              transition={{ duration: 0.25 }}
              className="border-b border-line"
              onMouseEnter={(e) => {
                x.jump(e.clientX + 28);
                y.jump(e.clientY - 96);
                if (hovered === null) {
                  sx.jump(e.clientX + 28);
                  sy.jump(e.clientY - 96);
                }
                setHovered(compra);
              }}
            >
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                onFocus={() => setHovered(compra)}
                onBlur={() => setHovered(null)}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid-cols-[9rem_minmax(0,1fr)_12rem_10rem_auto]"
              >
                <span className={`order-2 text-sm md:order-none ${statusTone(compra.status)}`}>
                  {STATUS_LABELS[compra.status]}
                </span>
                <span className="order-1 col-span-2 min-w-0 md:order-none md:col-span-1">
                  <span className="block truncate text-xl font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
                    {compra.lote_title}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-muted">
                    Lote {compra.lot_number}, {compra.remate_title}
                  </span>
                </span>
                <span className="hidden truncate text-sm text-ink-muted md:block">{compra.rematador_name}</span>
                <span className="hidden text-right text-lg font-medium tabular-nums md:block">{money(compra.final_price)}</span>
                <ArrowUpRight
                  className="order-3 h-5 w-5 justify-self-end text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 md:order-none"
                  aria-hidden="true"
                />
              </a>
            </motion.li>
          );
        })}
      </ul>

      <AnimatePresence>
        {hovered && (
          <motion.div
            key="preview"
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-30 hidden h-44 w-60 overflow-hidden rounded-xl bg-surface-subtle shadow-2xl ring-1 ring-black/5 md:block"
            style={{ x: sx, y: sy }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
          >
            <CompraThumb compra={hovered} className="h-full w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
