import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { ImageGalleryMain } from './ImageGalleryMain';
import { ImageGalleryThumbnails } from './ImageGalleryThumbnails';
import { useImageGallery } from './useImageGallery';

export interface ActiveLotePanelProps {
  lote: Lote;
}

/**
 * Sección principal de la sala: la identidad del lote actualmente abierto (imagen,
 * número/categoría, título, descripción) -- rediseño visual (ver prototipo aprobado).
 *
 * Precio/oferta/cuenta regresiva/formulario de ofertar YA NO viven acá: se movieron a
 * `SalaBidPanel`, en el sidebar derecho de `SalaPage`, junto al historial/chat
 * (`SalaSidePanel`) -- composición nueva pedida explícitamente ("no necesariamente
 * mediante una enorme card oscura"). Por eso este componente perdió la mayoría de sus
 * props (`remateId`/`currency`/`winningOffer`/`remateStatus`/`viewerRole`): ya no le
 * hacen falta.
 *
 * Ficha técnica (`lote.attributes`/`quantity`/`unit_label`) tampoco se muestra más acá
 * (pedido explícito, decisión de contenido confirmada -- no solo visual: un lote real
 * puede tener atributos que hoy dejan de verse en la Sala). Sin card envolvente
 * (`rounded-xl border bg-white shadow-sm p-5` que tenía antes) -- composición abierta,
 * el fondo de la página ya alcanza para separar esta sección de las demás.
 */
export function ActiveLotePanel({ lote }: ActiveLotePanelProps) {
  const gallery = useImageGallery(lote.images);

  return (
    <div className="flex flex-col gap-4">
      <ImageGalleryMain
        sorted={gallery.sorted}
        selectedIndex={gallery.selectedIndex}
        selected={gallery.selected}
        hasMultiple={gallery.hasMultiple}
        goTo={gallery.goTo}
        alt={lote.title}
        aspectClassName="aspect-video"
      />

      <ImageGalleryThumbnails
        sorted={gallery.sorted}
        selectedIndex={gallery.selectedIndex}
        hasMultiple={gallery.hasMultiple}
        goTo={gallery.goTo}
      />

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Lote {lote.lot_number} · {CATEGORY_LABELS[lote.category]}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">{lote.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {lote.description ?? 'Este lote todavía no tiene una descripción cargada.'}
        </p>
      </div>
    </div>
  );
}
