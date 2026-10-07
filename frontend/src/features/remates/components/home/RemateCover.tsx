import clsx from 'clsx';
import { useLoteCoverImages } from '../../hooks';
import type { Remate } from '../../types';
import { LotesCollagePlaceholder } from '../LotesCollagePlaceholder';

function CollageCover({ remateId, className }: { remateId: string; className?: string }) {
  const images = useLoteCoverImages(remateId);
  return <LotesCollagePlaceholder images={images ?? []} className={className} />;
}

/**
 * Portada de un remate: su `cover_image_url` si tiene; si no, el collage con la primera
 * foto de hasta 4 de sus lotes (mismo respaldo que `RemateCard`); y sin fotos de lotes,
 * el degradé genérico de `CoverPlaceholder`. Separado en dos componentes para que el
 * pedido de lotes (`useLoteCoverImages`) solo ocurra cuando de verdad hace falta.
 */
export function RemateCover({ remate, className }: { remate: Pick<Remate, 'id' | 'cover_image_url'>; className?: string }) {
  if (remate.cover_image_url) {
    return <img src={remate.cover_image_url} alt="" className={clsx('object-cover', className)} />;
  }
  return <CollageCover remateId={remate.id} className={className} />;
}
