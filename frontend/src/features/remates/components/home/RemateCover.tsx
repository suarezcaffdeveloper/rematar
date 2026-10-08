import { useEffect } from 'react';
import clsx from 'clsx';
import { useLoteCoverImages } from '../../hooks';
import type { Remate } from '../../types';
import { LotesCollagePlaceholder } from '../LotesCollagePlaceholder';
import { optimizedImage } from '../../../../shared/lib/image';

function CollageCover({ remateId, className }: { remateId: string; className?: string }) {
  const images = useLoteCoverImages(remateId);
  return <LotesCollagePlaceholder images={(images ?? []).map((url) => optimizedImage(url, COLLAGE_WIDTH))} className={className} />;
}

/**
 * Portada de un remate: su `cover_image_url` si tiene; si no, el collage con la primera
 * foto de hasta 4 de sus lotes (mismo respaldo que `RemateCard`); y sin fotos de lotes,
 * el degradé genérico de `CoverPlaceholder`. Separado en dos componentes para que el
 * pedido de lotes (`useLoteCoverImages`) solo ocurra cuando de verdad hace falta.
 */
const COVER_WIDTH = 480;
const COLLAGE_WIDTH = 480;

function preload(urls: string[]) {
  for (const url of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}

function CollagePreload({ remateId }: { remateId: string }) {
  const images = useLoteCoverImages(remateId);
  useEffect(() => {
    if (images) preload(images.map((url) => optimizedImage(url, COLLAGE_WIDTH)));
  }, [images]);
  return null;
}

/**
 * Pide de antemano la imagen de la portada (sin renderizar nada) para que, cuando se
 * monte `RemateCover` -- p. ej. la portada flotante del índice al pasar el mouse --, ya
 * esté en la caché del navegador. Usa los mismos anchos que `RemateCover`: si no, la URL
 * cambia y la precarga no sirve.
 */
export function RemateCoverPreload({ remate }: { remate: Pick<Remate, 'id' | 'cover_image_url'> }) {
  const cover = remate.cover_image_url;
  useEffect(() => {
    if (cover) preload([optimizedImage(cover, COVER_WIDTH)]);
  }, [cover]);
  return cover ? null : <CollagePreload remateId={remate.id} />;
}

export function RemateCover({
  remate,
  className,
  eager = false,
  width = COVER_WIDTH,
}: {
  remate: Pick<Remate, 'id' | 'cover_image_url'>;
  className?: string;
  /** Imagen de la primera pantalla: se pide ya, sin `loading="lazy"`. */
  eager?: boolean;
  /** Ancho CSS aproximado con el que se muestra (se duplica para retina). */
  width?: number;
}) {
  if (remate.cover_image_url) {
    return (
      <img
        src={optimizedImage(remate.cover_image_url, width)}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        alt=""
        className={clsx('object-cover', className)}
      />
    );
  }
  return <CollageCover remateId={remate.id} className={className} />;
}
