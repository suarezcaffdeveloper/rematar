import { PackageSearch } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatCurrency } from '../../../shared/lib/format';
import { ImageGallery } from '../../sala/components/ImageGallery';
import { GavelIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';

export interface ConsolaLotePanelProps {
  activeLote: Lote | null;
  currency: string;
  hasUpcomingLotes: boolean;
}

function formatAttributeKey(key: string): string {
  const withSpaces = key.replace(/_/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Panel principal de la Consola Operativa (Épica 5, Módulo 5.2; reordenado en la Épica
 * 9, Etapa 4/5 -- rediseño; y de nuevo en el rediseño a "Modo Remate"): el lote
 * actualmente abierto, con toda su información -- imagen principal, galería, número,
 * nombre, descripción, ficha técnica, precio inicial, oferta líder, incremento mínimo y
 * estado. Reusa `ImageGallery` de `features/sala/` tal cual (componente puro, sin
 * ninguna acción de comprador embebida) -- misma vista que ya tiene la Sala del Remate,
 * para que la imagen que ve el rematador sea exactamente la misma que ven los
 * compradores. No hay ningún campo de video/stream en `Lote`/`Remate` hoy -- "Video en
 * vivo (si existe)" del pedido siempre cae en la rama de imágenes por ahora; la galería
 * queda como el elemento protagonista de la columna izquierda para que, el día que ese
 * campo exista, un reproductor pueda ocupar exactamente este lugar sin reestructurar
 * nada más.
 *
 * Segunda vuelta del rediseño "Modo Remate" (sobre la captura de referencia de Stitch/
 * AuctionPro): el rematador NO prioriza mirar el lote -- prioriza operar (gestionar el
 * lote, controlar ofertas, seguir el chat), a diferencia de la Sala del comprador
 * (`ActiveLotePanel`), donde la media sigue siendo el elemento protagonista. Por eso acá
 * la galería usa una relación de aspecto más baja que la de la Sala (`aspectClassName`
 * de `ImageGallery`, sin tocar su default) y el panel entero queda más compacto -- el
 * espacio que se libera lo gana `ConsolaControlPanel`, en la columna del medio.
 *
 * Ya no muestra ningún precio destacado ni "Oferta líder": ese dato ya vive, grande y
 * arriba de todo, en `OfferHistoryPanel` (`ConsolaSidebar`, columna derecha) -- repetirlo
 * acá era información duplicada (pedido explícito de sacarla). Lo único que queda de precio es
 * una referencia chica (precio inicial + incremento mínimo), útil como dato de fondo
 * pero sin competir visualmente con la oferta líder real. Tampoco muestra ningún
 * countdown -- el rediseño "Modo Remate" elimina por completo el concepto de timer (ver
 * también `ConsolaControlPanel`, que dejó de tener controles de timer).
 *
 * Deliberadamente sin ningún botón de acción: a diferencia de `ActiveLotePanel` (Sala,
 * comprador, que embebe `PlaceBidButton`), acá las acciones viven en su propio
 * `ConsolaControlPanel` -- el enunciado de este módulo separa explícitamente "panel
 * principal" de "panel de control", y mezclarlos complicaría reusar este panel el día
 * que la Consola necesite mostrar el lote activo en un contexto sin controles (por
 * ejemplo, una vista de solo lectura para un segundo operador).
 *
 * Retexturizado sobre el prototipo aprobado (captura puntual de la Consola Operativa):
 * pierde la card propia (`rounded-xl border bg-white shadow-sm p-3`) -- mismo criterio
 * "no más cards" que `ActiveLotePanel` ya aplicó en la Sala, el fondo de la página
 * alcanza para separar este bloque de `ConsolaControlPanel`. El estado del lote
 * (`Badge`) pasa a vivir en la misma línea que "Lote N · Categoría" en vez de flotar
 * aparte a la derecha -- se lee como un solo dato, no dos alineados por separado. "Ficha
 * técnica" pierde su fondo gris propio (`bg-surface-subtle`) -- composición abierta,
 * mismo criterio que el resto del panel.
 */
export function ConsolaLotePanel({ activeLote, currency, hasUpcomingLotes }: ConsolaLotePanelProps) {
  if (!activeLote) {
    return (
      <EmptyState
        icon={<GavelIcon className="h-10 w-10" />}
        title={hasUpcomingLotes ? 'Sin lote activo en este momento' : 'Todos los lotes fueron procesados'}
        description={
          hasUpcomingLotes
            ? 'Abrí un lote desde el panel de control para empezar a recibir ofertas.'
            : 'No quedan lotes pendientes para rematar. Revisá los lotes desiertos si querés volver a ofrecer alguno, o finalizá el remate cuando corresponda -- el remate sigue abierto hasta que lo decidas.'
        }
      />
    );
  }

  const attributeEntries = Object.entries(activeLote.attributes);

  return (
    <div className="flex flex-col gap-4">
      <ImageGallery
        key={activeLote.id}
        images={activeLote.images}
        alt={activeLote.title}
        aspectClassName="aspect-[2/1]"
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
            <PackageSearch aria-hidden="true" className="h-3.5 w-3.5" />
            Lote {activeLote.lot_number} · {CATEGORY_LABELS[activeLote.category]}
          </p>
          <Badge variant={LOTE_STATUS_BADGE_VARIANTS[activeLote.status]}>
            {LOTE_STATUS_LABELS[activeLote.status]}
          </Badge>
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">{activeLote.title}</h2>
        <p className="mt-1 text-xs text-ink-faint">
          Precio inicial {formatCurrency(activeLote.base_price, currency)} · incremento mínimo{' '}
          {formatCurrency(activeLote.min_increment, currency)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          {activeLote.description ?? 'Este lote todavía no tiene una descripción cargada.'}
        </p>

        {(attributeEntries.length > 0 || activeLote.unit_label) && (
          <div className="border-t border-line pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Ficha técnica</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {activeLote.unit_label && (
                <div>
                  <dt className="text-xs text-ink-faint">Cantidad</dt>
                  <dd className="text-sm font-medium text-ink">
                    {activeLote.quantity} {activeLote.unit_label}
                  </dd>
                </div>
              )}
              {attributeEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-ink-faint">{formatAttributeKey(key)}</dt>
                  <dd className="text-sm font-medium text-ink">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
