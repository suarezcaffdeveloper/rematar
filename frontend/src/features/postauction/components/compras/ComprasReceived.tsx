import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { STATUS_LABELS } from '../../labels';
import type { PostAuctionCase } from '../../types';
import { formatCurrency } from '../../../../shared/lib/format';
import { CompraCover } from './CompraCover';
import { statusTone } from './statusTone';

const CURRENCY = 'ARS';

/** "Recibidas": índice compacto (mismo lenguaje que "Todos los remates" del inicio). Al
 * pasar el mouse por una fila, las demás se atenúan y la foto del lote sigue al cursor. */
export function ComprasReceived({ compras }: { compras: PostAuctionCase[] }) {
  const [hovered, setHovered] = useState<PostAuctionCase | null>(null);
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
                // Posiciona la foto ya en la entrada: sin esto aparecería un instante en
                // (0, 0) hasta el primer `mousemove` de la lista.
                x.jump(e.clientX + 28);
                y.jump(e.clientY - 96);
                if (hovered === null) {
                  sx.jump(e.clientX + 28);
                  sy.jump(e.clientY - 96);
                }
                setHovered(compra);
              }}
            >
              <Link
                to={`/mis-compras/${compra.id}`}
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
                <span className="hidden text-right text-lg font-medium tabular-nums md:block">
                  {formatCurrency(compra.final_price, CURRENCY)}
                </span>
                <ArrowUpRight
                  className="order-3 h-5 w-5 justify-self-end text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 md:order-none"
                  aria-hidden="true"
                />
              </Link>
            </motion.li>
          );
        })}
      </ul>

      {/* Foto flotante que sigue al cursor -- solo con mouse (md+), decorativa. */}
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
            <CompraCover compra={hovered} className="h-full w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
