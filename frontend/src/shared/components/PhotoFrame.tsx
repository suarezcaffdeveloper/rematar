import { useState } from 'react';
import clsx from 'clsx';
import type { StockPhoto } from '../media/stockPhotos';

export interface PhotoFrameProps {
  photo: StockPhoto;
  className?: string;
  /** Insignia opcional sobre la esquina inferior izquierda (ej. el rubro del remate). */
  label?: string;
  rounded?: string;
}

/**
 * Fotografía de fondo con degradé de marca siempre presente detrás: si la imagen
 * externa (Unsplash) tardara en cargar o dejara de estar disponible en algún momento,
 * el degradé sostiene la composición en vez de dejar un hueco en blanco -- por eso
 * `onError` sólo oculta el `<img>`, nunca el contenedor. Usado por la landing
 * (`features/landing`) y por el login (`features/auth/pages/LoginPage.tsx`).
 */
export function PhotoFrame({ photo, className, label, rounded = 'rounded-3xl' }: PhotoFrameProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={clsx(
        'relative overflow-hidden bg-gradient-to-br from-brand-100 via-slate-100 to-brand-50',
        rounded,
        className,
      )}
    >
      {!failed && (
        <img
          src={photo.url}
          alt={photo.alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-slate-900/0 to-transparent" />
      {label && (
        <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
          {label}
        </span>
      )}
    </div>
  );
}
