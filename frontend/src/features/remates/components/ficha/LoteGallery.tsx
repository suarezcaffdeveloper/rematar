import { useMemo, useState, type ReactNode } from 'react';
import { Images } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import { LoteCountdown } from '../../../sala/components/LoteCountdown';
import { countByStatus, FILTERABLE_LOTE_STATUSES, LOTE_STATUS_TONE, sortedImages } from '../../ficha';
import { LOTE_STATUS_LABELS } from '../../labels';
import type { Lote, LoteStatus, RemateAuctionType } from '../../types';
import { CoverPlaceholder } from '../CoverPlaceholder';
import { BoxIcon } from '../icons';
import { LoteViewer } from './LoteViewer';
import { optimizedImage } from '../../../../shared/lib/image';

export interface LoteGalleryProps {
  lotes: Lote[];
  currency: string;
  auctionType: RemateAuctionType;
  /** Monto de la oferta vigente de cada lote abierto (`GET .../ofertas/leading`, ya resuelto
   * por `RemateDetailPage`) -- `null` si todavía no tiene ofertas, `undefined` mientras se
   * carga. Solo se usa en modo TIMED. */
  leadingAmounts: Record<string, string | null>;
}

type Filter = 'all' | LoteStatus;

/**
 * Los lotes del remate como una galería donde la foto manda: el primero ocupa cuatro
 * lugares, cada uno muestra número, estado y precio, y al pasar el mouse (o enfocar) se
 * despliega el incremento y la reserva. Un filtro por estado arriba. Tocar un lote abre el
 * visor con todas sus fotos (`LoteViewer`). En un remate TIMED, un lote `open` muestra el
 * precio que va liderando (o la base si todavía no hay ofertas) y la cuenta regresiva que
 * le queda (`LoteCountdown`, tictac en vivo con `lote.timer_ends_at` como fuente de
 * verdad): que se vea de un vistazo cómo viene cada lote sin entrar a la sala.
 */
export function LoteGallery({ lotes, currency, auctionType, leadingAmounts }: LoteGalleryProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Lote | null>(null);
  const counts = useMemo(() => countByStatus(lotes), [lotes]);
  const visible = filter === 'all' ? lotes : lotes.filter((lote) => lote.status === filter);

  return (
    <>
      <section aria-labelledby="lotes-title" className="mt-20 pb-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="lotes-title" className="text-2xl font-semibold tracking-tight">
              Lotes de este remate
            </h2>
            <p className="mt-1 text-ink-muted">Tocá un lote para ver todas sus fotos.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar lotes por estado">
            <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
              Todos <span className="tabular-nums opacity-60">{lotes.length}</span>
            </Chip>
            {FILTERABLE_LOTE_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
              <Chip key={status} selected={filter === status} onClick={() => setFilter(status)}>
                {LOTE_STATUS_LABELS[status]} <span className="tabular-nums opacity-60">{counts.get(status)}</span>
              </Chip>
            ))}
          </div>
        </div>

        <ul className="mt-6 grid auto-rows-[15rem] grid-cols-2 gap-3 lg:grid-cols-4">
          {visible.map((lote, i) => (
            <LoteTile
              key={lote.id}
              lote={lote}
              currency={currency}
              big={i === 0 && visible.length > 2}
              isTimed={auctionType === 'timed'}
              leadingAmount={leadingAmounts[lote.id]}
              onOpen={() => setSelected(lote)}
            />
          ))}
        </ul>
      </section>

      <LoteViewer lote={selected} currency={currency} onClose={() => setSelected(null)} />
    </>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
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

function LoteTile({
  lote,
  currency,
  big,
  isTimed,
  leadingAmount,
  onOpen,
}: {
  lote: Lote;
  currency: string;
  big: boolean;
  isTimed: boolean;
  leadingAmount: string | null | undefined;
  onOpen: () => void;
}) {
  const images = sortedImages(lote);
  const cover = images[0];
  const showTimed = isTimed && lote.status === 'open';
  const sold = lote.status === 'closed_sold' && lote.final_price ? lote.final_price : null;
  const hasLeading = showTimed && leadingAmount != null;

  const priceLabel = showTimed ? (hasLeading ? 'Precio actual' : 'Base') : sold ? 'Vendido en' : 'Base';
  const priceValue = showTimed ? (leadingAmount ?? lote.base_price) : (sold ?? lote.base_price);

  return (
    <li className={big ? 'col-span-2 row-span-2' : ''}>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`Lote ${lote.lot_number}: ${lote.title}`}
        className="group relative block h-full w-full overflow-hidden rounded-2xl bg-ink text-left text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {cover ? (
          <img
            src={optimizedImage(cover.url, 1200)}
            loading="lazy" decoding="async"
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <CoverPlaceholder
            className="absolute inset-0 h-full w-full"
            icon={<BoxIcon className="h-10 w-10 text-brand-300" />}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3.5">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold tabular-nums text-ink backdrop-blur">
            Lote {lote.lot_number}
          </span>
          <span
            className={`rounded-full bg-white/90 px-3 py-1 text-xs font-medium backdrop-blur ${LOTE_STATUS_TONE[lote.status]}`}
          >
            {LOTE_STATUS_LABELS[lote.status]}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p
            className={`text-balance font-semibold leading-tight tracking-tight ${
              big ? 'text-2xl sm:text-3xl' : 'line-clamp-2 text-base sm:text-lg'
            }`}
          >
            {lote.title}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p>
              <span className="block text-xs text-white/70">{priceLabel}</span>
              <span
                className={`block font-semibold tabular-nums tracking-tight ${big ? 'text-3xl' : 'text-xl'} ${
                  hasLeading ? 'text-success-300' : ''
                }`}
              >
                {formatCurrency(priceValue, currency)}
              </span>
            </p>
            {showTimed && (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-sm text-ink">
                <LoteCountdown
                  variant="inline"
                  endsAt={lote.timer_ends_at}
                  pausedRemainingSeconds={lote.timer_paused_remaining_seconds}
                />
              </span>
            )}
            {!showTimed && images.length > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-xs backdrop-blur">
                <Images className="h-3.5 w-3.5" aria-hidden="true" />
                {images.length}
              </span>
            )}
          </div>
          {/* Se despliega al pasar el mouse o enfocar: el resto de los precios del lote. */}
          <div className="grid grid-rows-[0fr] transition-all duration-300 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
            <p className="overflow-hidden text-sm text-white/80">
              <span className="block pt-2">
                Incremento {formatCurrency(lote.min_increment, currency)}
                {lote.reserve_price && !sold ? `, reserva ${formatCurrency(lote.reserve_price, currency)}` : ''}
              </span>
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}
