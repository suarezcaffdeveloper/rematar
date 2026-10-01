import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { Lote } from '../../remates/types';

const SKELETON_COUNT = 4;

export interface SalaUpcomingGridProps {
  lotes: Lote[];
  isLoading: boolean;
  currency: string;
}

/**
 * Los lotes que siguen, en una grilla debajo del lote actual y de las ofertas (la página
 * scrollea, hay lugar). Son solo informativos: NO se puede entrar a un lote futuro desde
 * la Sala (decisión de producto ya confirmada), por eso son `<li>` y no botones ni links.
 * Desde la Épica 9 esto era una tira horizontal con flechas (`UpcomingLotesStrip`).
 */
export function SalaUpcomingGrid({ lotes, isLoading, currency }: SalaUpcomingGridProps) {
  return (
    <section aria-labelledby="proximos-lotes">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="proximos-lotes" className="text-xl font-semibold tracking-tight text-ink">
          Próximos lotes
        </h2>
        {!isLoading && lotes.length > 0 && (
          <p className="text-sm text-ink-muted">
            {lotes.length === 1 ? 'Queda 1' : `Quedan ${lotes.length}`}, en este orden.
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
      ) : lotes.length === 0 ? (
        <p className="text-sm text-ink-faint">No hay más lotes cargados en este remate.</p>
      ) : (
        <ul aria-label="Próximos lotes" className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
          {lotes.map((lote) => {
            const cover = [...lote.images].sort((a, b) => a.order - b.order)[0];
            return (
              <li key={lote.id} className="min-w-0">
                <div className="aspect-video overflow-hidden rounded-xl bg-surface-subtle">
                  {cover ? (
                    <img src={cover.url} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <CoverPlaceholder
                      className="h-full w-full"
                      icon={<BoxIcon className="h-6 w-6 text-brand-300" />}
                    />
                  )}
                </div>
                <p className="mt-2 text-xs tabular-nums text-ink-faint">Lote {lote.lot_number}</p>
                <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{lote.title}</p>
                <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                  Base {formatCurrency(lote.base_price, currency)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
