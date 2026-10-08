import { useMemo, useState } from 'react';
import { formatCurrency } from '../../../../shared/lib/format';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import { useLote } from '../../../remates/hooks';
import { CATEGORY_LABELS } from '../../../remates/labels';
import { formatShortDate } from '../../comprasUtils';
import { getResponsables } from '../../detalleUtils';
import type { PostAuctionCaseDetail } from '../../types';
import { optimizedImage } from '../../../../shared/lib/image';

const CURRENCY = 'ARS';
const LONG_DESCRIPTION = 220;

/**
 * Columna fija del detalle: las fotos del lote (con miniaturas para cambiar de una a
 * otra), qué es, cuánto costó y los datos de la compra. El detalle completo del lote
 * (`images`, `description`, `category`) no viene en `PostAuctionCaseDetail`, así que se
 * pide con `useLote`; mientras carga -- o si falla -- se muestra la portada que sí trae el
 * caso (`lote_cover_image_url`), que es un dato secundario y no debe bloquear la pantalla.
 */
export function DetalleAside({ detail }: { detail: PostAuctionCaseDetail }) {
  const { lote } = useLote(detail.remate_id, detail.lote_id, true);
  const [photo, setPhoto] = useState(0);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const photos = useMemo(() => {
    const fromLote = lote ? [...lote.images].sort((a, b) => a.order - b.order).map((image) => image.url) : [];
    if (fromLote.length > 0) return fromLote;
    return detail.lote_cover_image_url ? [detail.lote_cover_image_url] : [];
  }, [lote, detail.lote_cover_image_url]);

  const current = Math.min(photo, Math.max(photos.length - 1, 0));
  const { martillero, empresa } = getResponsables(detail);
  const description = lote?.description?.trim() ?? '';
  const isLong = description.length > LONG_DESCRIPTION;

  return (
    <aside aria-label="Datos de la compra" className="lg:sticky lg:top-24 lg:self-start">
      <div className="overflow-hidden rounded-2xl bg-surface-subtle">
        {photos.length > 0 ? (
          <img
            key={photos[current]}
            src={photos[current]}
            alt={detail.lote_title}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <CoverPlaceholder
            className="aspect-[4/3] w-full"
            icon={<BoxIcon className="h-10 w-10 text-brand-300" />}
          />
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Fotos del lote">
          {photos.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => setPhoto(i)}
              aria-label={`Ver foto ${i + 1} de ${photos.length}`}
              aria-pressed={current === i}
              className={`h-14 w-20 overflow-hidden rounded-lg ring-offset-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                current === i ? 'ring-2 ring-ink' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <img src={optimizedImage(url, 1200)} loading="lazy" decoding="async" alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <h1 className="mt-7 text-balance text-2xl font-semibold leading-tight tracking-tight">{detail.lote_title}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Lote {detail.lot_number} del remate {detail.remate_title}
      </p>
      {lote && <p className="mt-1 text-sm text-ink-muted">{CATEGORY_LABELS[lote.category]}</p>}
      {description && (
        <div className="mt-4">
          <p
            className={`whitespace-pre-line text-sm leading-relaxed text-ink-muted ${
              isLong && !descriptionOpen ? 'line-clamp-4' : ''
            }`}
          >
            {description}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setDescriptionOpen((open) => !open)}
              className="mt-1 rounded text-sm font-medium text-brand-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {descriptionOpen ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </div>
      )}

      <p className="mt-6 text-4xl font-semibold tabular-nums tracking-tight">
        {formatCurrency(detail.final_price, CURRENCY)}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        precio final, base {formatCurrency(detail.base_price, CURRENCY)}
      </p>

      <dl className="mt-6 border-t border-ink">
        <Fact label="Adjudicado el" value={formatShortDate(detail.created_at)} />
        <Fact label="Martillero" value={martillero ?? '-'} />
        {empresa && <Fact label="Empresa" value={empresa} />}
      </dl>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
      <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
