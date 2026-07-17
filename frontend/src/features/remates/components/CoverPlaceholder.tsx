import type { ReactNode } from 'react';
import clsx from 'clsx';
import { GavelIcon } from './icons';

export interface CoverPlaceholderProps {
  className?: string;
  icon?: ReactNode;
}

/** Portada por defecto -- reutilizada por `RemateCard`, `RemateDetailHeader` y
 * `LoteCard`: ningún remate ni lote tiene garantizado un `cover_image_url`/`images[0]`
 * (son campos opcionales del backend). En vez de un `<img>` roto o un rectángulo gris
 * vacío, un degradé de marca con un ícono -- por defecto el martillo del remate, pero
 * `LoteCard` pasa `<BoxIcon />` para diferenciarse visualmente en el listado. */
export function CoverPlaceholder({ className, icon }: CoverPlaceholderProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center bg-gradient-to-br from-brand-100 via-brand-50 to-slate-100',
        className,
      )}
    >
      {icon ?? <GavelIcon className="h-10 w-10 text-brand-300" />}
    </div>
  );
}
