import { useNavigate } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon, PersonIcon } from '../../remates/components/icons';
import { StatusBadge } from './StatusBadge';
import type { PostAuctionCase } from '../types';

export interface CaseCardProps {
  item: PostAuctionCase;
  to: string;
  /** `rematador`: muestra el nombre del comprador. `comprador`: muestra el nombre del
   * rematador -- cada lado de la relación ve a la otra parte, nunca a sí mismo. */
  perspective: 'rematador' | 'comprador';
  currency?: string;
}

/** Tarjeta de un caso post-remate (rediseño inspirado en el mockup de Stitch,
 * `MisCompras/`) -- portada + badge de estado superpuesto, precio destacado, la
 * contraparte (comprador/rematador según `perspective`) con fecha de adjudicación, y un
 * botón real al pie en vez de que toda la tarjeta sea un `<Link>` -- mismo patrón que
 * `RemateCard` (evita anidar controles interactivos dentro de un elemento clickeable). */
export function CaseCard({ item, to, perspective, currency = 'ARS' }: CaseCardProps) {
  const navigate = useNavigate();
  const counterpartLabel = perspective === 'rematador' ? 'Comprador' : 'Martillero';
  const counterpartName = perspective === 'rematador' ? item.buyer_name : item.rematador_name;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-xl">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-subtle">
        {item.lote_cover_image_url ? (
          <img
            src={item.lote_cover_image_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-10 w-10 text-brand-300" />} />
        )}
        <div className="absolute right-3 top-3">
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-ink">{item.lote_title}</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Lote {item.lot_number} · {item.remate_title}
          </p>
        </div>

        <div className="flex flex-col border-t border-line pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Precio final</span>
          <span className="text-2xl font-bold text-brand-600">{formatCurrency(item.final_price, currency)}</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <PersonIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{counterpartLabel}</p>
              <p className="truncate text-sm font-medium text-ink">{counterpartName ?? '—'}</p>
            </div>
          </div>
          <p className="text-xs text-ink-faint">
            Adjudicado el <span className="font-medium text-ink-muted">{formatDateTime(item.created_at)}</span>
          </p>
        </div>

        <div className="mt-auto pt-1">
          <Button className="w-full" onClick={() => navigate(to)}>
            Ver detalles
          </Button>
        </div>
      </div>
    </article>
  );
}
