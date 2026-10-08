import clsx from 'clsx';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import { optimizedImage } from '../../../../shared/lib/image';

/** Foto del lote vendido (`lote_cover_image_url`) o, si no tiene, el placeholder de marca. */
export function SaleCover({ url, className }: { url: string | null; className?: string }) {
  return url ? (
    <img src={optimizedImage(url, 480)} loading="lazy" decoding="async" alt="" className={clsx('object-cover', className)} />
  ) : (
    <CoverPlaceholder className={className} icon={<BoxIcon className="h-6 w-6 text-brand-300" />} />
  );
}
