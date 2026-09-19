import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { ImageGalleryMain } from '../../sala/components/ImageGalleryMain';
import { ImageGalleryThumbnails } from '../../sala/components/ImageGalleryThumbnails';
import { useImageGallery } from '../../sala/components/useImageGallery';

export interface TimedLoteCenterPanelProps {
  lote: Lote;
}

/**
 * Columna central de `TimedSalaPage` -- identidad del lote fijado (número/categoría,
 * título, descripción) PRIMERO, galería completa DESPUÉS (pedido explícito,
 * distribución de referencia) -- mismo patrón "sin card envolvente" que
 * `ActiveLotePanel.tsx` (Sala LIVE, ya rediseñada): `flex flex-col gap-4`, el fondo de
 * la página alcanza para separar esta columna de la izquierda/derecha, sin repetir el
 * `rounded-xl border border-line bg-white p-4` que tenía `TimedLoteDetailPanel`.
 *
 * Sin badge de estado junto al título (pedido explícito, "quiero que quites la nube que
 * dice abierto") -- el estado del lote ya se infiere del panel de puja a la derecha
 * (`TimedLoteBidRail`), repetirlo acá era ruido visual.
 *
 * Sin cap de altura en la imagen: esta columna vive dentro del área que scrollea como
 * página (ver `TimedSalaPage`), ya no necesita caber entera en el viewport de una vez.
 * Descripción entera, sin `line-clamp`: el usuario confirmó que nunca hay tanta
 * información como para que ocupe demasiado.
 *
 * Sin ficha técnica (`lote.attributes`/`quantity`/`unit_label`) -- misma decisión de
 * contenido ya confirmada para `ActiveLotePanel` (no solo visual), extendida acá.
 */
export function TimedLoteCenterPanel({ lote }: TimedLoteCenterPanelProps) {
  const gallery = useImageGallery(lote.images);

  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Lote {lote.lot_number} · {CATEGORY_LABELS[lote.category]}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">{lote.title}</h2>
      </div>

      <p className="text-sm leading-relaxed text-ink-muted">
        {lote.description ?? 'Este lote todavía no tiene una descripción cargada.'}
      </p>

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
    </div>
  );
}
