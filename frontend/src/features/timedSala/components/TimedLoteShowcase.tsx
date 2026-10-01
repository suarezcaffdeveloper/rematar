import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { ExpandableDescription } from '../../sala/components/ExpandableDescription';
import { LotePhotoGallery } from '../../sala/components/LotePhotoGallery';

export interface TimedLoteShowcaseProps {
  lote: Lote;
  currency: string;
}

/**
 * La vitrina de la Sala Timed: el lote elegido en grande -- rubro y título arriba, la
 * galería de fotos y, debajo, su descripción y los tres datos que importan para ofertar
 * (base, incremento mínimo y cuándo cierra). El título se lee entero (baja de renglón si
 * es largo); la descripción se recorta a cuatro renglones con "Ver más" si hace falta.
 *
 * Sin ficha técnica (`lote.attributes`/`quantity`/`unit_label`): decisión de contenido ya
 * confirmada para toda la Sala del comprador.
 */
export function TimedLoteShowcase({ lote, currency }: TimedLoteShowcaseProps) {
  const closesAt = lote.status === 'open' ? lote.timer_ends_at : null;

  return (
    <section aria-label={`Lote ${lote.lot_number}`} className="min-w-0">
      <p className="text-sm text-ink-muted">
        Lote {lote.lot_number} · {CATEGORY_LABELS[lote.category]}
      </p>
      <h2 className="mb-4 mt-1 text-balance break-words text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[2rem]">
        {lote.title}
      </h2>

      <LotePhotoGallery lote={lote} />

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Sobre este lote</h3>
        <ExpandableDescription text={lote.description} resetKey={lote.id} lines={4} className="mt-2" />
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <div>
            <dt className="text-ink-faint">Base</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink">{formatCurrency(lote.base_price, currency)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Incremento mínimo</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink">
              {formatCurrency(lote.min_increment, currency)}
            </dd>
          </div>
          {closesAt && (
            <div>
              <dt className="text-ink-faint">Cierra</dt>
              <dd className="font-semibold text-ink">{formatDateTime(closesAt)}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
