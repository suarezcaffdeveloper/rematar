import clsx from 'clsx';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import type { PostAuctionCase } from '../../types';
import { optimizedImage } from '../../../../shared/lib/image';

/** Foto del lote de una compra, o el degradé de marca con el ícono de caja si el lote no
 * tiene portada (mismo respaldo que `CaseCard`). */
export function CompraCover({
  compra,
  className,
}: {
  compra: Pick<PostAuctionCase, 'lote_cover_image_url'>;
  className?: string;
}) {
  if (compra.lote_cover_image_url) {
    return <img src={optimizedImage(compra.lote_cover_image_url, 480)} loading="lazy" decoding="async" alt="" className={clsx('object-cover', className)} />;
  }
  return <CoverPlaceholder className={className} icon={<BoxIcon className="h-1/3 w-1/3 text-brand-300" />} />;
}
