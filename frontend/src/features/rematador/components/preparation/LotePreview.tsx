import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import { CATEGORY_LABELS } from '../../../remates/labels';
import type { RemateCategory } from '../../../remates/types';
import { LiveDot } from '../../../remates/components/home/LiveDot';

export interface LotePreviewProps {
  lotNumber: string;
  category: RemateCategory | '';
  title: string;
  description: string;
  basePrice: string;
  minIncrement: string;
  currency: string;
  /** URLs de las fotos, en orden: la primera es la principal. */
  images: string[];
}

function formatOrDash(value: string, currency: string): string {
  return Number(value) > 0 ? formatCurrency(value, currency) : '–';
}

/**
 * Así ve el comprador este lote en la Sala: número y rubro, galería (la primera foto es la
 * principal), nombre, descripción y precios base e incremento. Es fiel a lo que la Sala
 * muestra de verdad (`LoteIdentity`, `SalaBidPanel`): NO incluye el precio de reserva, el
 * reencolado, ni atributos/cantidad/unidad -- esos nunca llegan al comprador (decisión de
 * contenido confirmada para toda la Sala). Se actualiza mientras se completa el formulario.
 */
export function LotePreview({
  lotNumber,
  category,
  title,
  description,
  basePrice,
  minIncrement,
  currency,
  images,
}: LotePreviewProps) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));

  // Si se quitan fotos, no queda apuntando a una que ya no existe.
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <LiveDot />
          <b>En remate ahora</b>
          <span className="ml-auto text-ink-muted">
            Lote {lotNumber || '–'}
            {category ? ` · ${CATEGORY_LABELS[category]}` : ''}
          </span>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-ink">
          {count > 0 ? (
            <>
              <img src={images[safeIndex]} alt={`Foto ${safeIndex + 1} de ${count}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-2.5 right-2.5 rounded-full bg-ink/60 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-md">
                {safeIndex + 1} de {count}
              </span>
              {count > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    onClick={() => setIndex((safeIndex - 1 + count) % count)}
                    className="absolute left-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                  >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Foto siguiente"
                    onClick={() => setIndex((safeIndex + 1) % count)}
                    className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                  >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </>
              )}
            </>
          ) : (
            <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-10 w-10 text-brand-300" />} />
          )}
        </div>

        {count > 1 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                aria-label={`Ver foto ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-9 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-opacity ${
                  i === safeIndex ? 'border-brand-600 opacity-100' : 'border-transparent opacity-60'
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <h3 className="text-xl font-semibold leading-tight tracking-tight">
          {title.trim() || <span className="text-ink-faint">Sin nombre todavía</span>}
        </h3>
        <p className="line-clamp-3 whitespace-pre-line text-sm text-ink-muted">{description.trim() || 'Sin descripción.'}</p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3">
          <div>
            <p className="text-xs text-ink-muted">Base</p>
            <p className="text-lg font-semibold tabular-nums">{formatOrDash(basePrice, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Incremento mínimo</p>
            <p className="text-lg font-semibold tabular-nums">{formatOrDash(minIncrement, currency)}</p>
          </div>
          <span aria-hidden="true" className="ml-auto rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white opacity-50">
            Ofertar
          </span>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        El comprador no ve el precio de reserva ni la configuración de reencolado.
      </p>
    </div>
  );
}
