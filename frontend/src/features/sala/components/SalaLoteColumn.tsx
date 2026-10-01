import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { GavelIcon, BoxIcon } from '../../remates/components/icons';
import type { Lote, Remate } from '../../remates/types';
import { LoteIdentity } from './LoteIdentity';
import { LotePhotoGallery } from './LotePhotoGallery';
import { StreamEmbed, buildYouTubeEmbedUrl } from './StreamEmbed';
import { useImageGallery } from './useImageGallery';

export interface SalaLoteColumnProps {
  remate: Remate;
  lote: Lote | null;
  onReload: () => void;
}

/**
 * La columna del lote en remate -- entera para el lote que está en el martillo (los
 * próximos van aparte, más abajo). Con transmisión cargada: el video arriba (mismo tamaño
 * que la imagen principal, fijo, sin poder ocultarse) y, debajo, una franja con la foto y
 * los datos del lote; sin transmisión, la galería de fotos y los datos. Sin lote abierto,
 * el estado vacío (el video, si hay, queda igual).
 */
export function SalaLoteColumn({ remate, lote, onReload }: SalaLoteColumnProps) {
  const hasStream =
    remate.stream_provider === 'youtube' &&
    !!remate.stream_video_id &&
    buildYouTubeEmbedUrl(remate.stream_video_id) !== null;

  return (
    <section aria-label="Lote en remate" className="flex min-w-0 flex-col gap-5 p-4 xl:p-5">
      <StreamEmbed provider={remate.stream_provider} videoId={remate.stream_video_id} title={remate.title} />

      {!lote ? (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="No hay ningún lote abierto en este momento"
          description="El martillero todavía no abrió un lote para ofertar. Volvé a intentar en unos minutos."
          action={
            <Button variant="secondary" onClick={onReload}>
              Actualizar
            </Button>
          }
        />
      ) : hasStream ? (
        <WithStream lote={lote} />
      ) : (
        <WithPhotos lote={lote} />
      )}
    </section>
  );
}

function WithStream({ lote }: { lote: Lote }) {
  const gallery = useImageGallery(lote.images);
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line p-3">
      {gallery.selected ? (
        <img src={gallery.selected.url} alt="" className="aspect-[4/3] w-36 shrink-0 rounded-xl object-cover" />
      ) : (
        <CoverPlaceholder
          className="aspect-[4/3] w-36 shrink-0 rounded-xl"
          icon={<BoxIcon className="h-6 w-6 text-brand-300" />}
        />
      )}
      <LoteIdentity lote={lote} />
    </div>
  );
}

function WithPhotos({ lote }: { lote: Lote }) {
  return (
    <>
      <LotePhotoGallery lote={lote} />
      <LoteIdentity lote={lote} />
    </>
  );
}
