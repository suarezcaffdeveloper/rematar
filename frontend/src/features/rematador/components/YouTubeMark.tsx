import clsx from 'clsx';

export interface YouTubeMarkProps {
  /** Lado del cuadrado insignia, en px. */
  size?: number;
  className?: string;
}

/**
 * Insignia roja + triángulo blanco (mismo lenguaje visual que el logo de YouTube) --
 * reemplaza al ícono de cámara genérico que usaba `StreamPanel` antes, para que se
 * identifique de un vistazo como "la transmisión de YouTube" en vez de un video
 * cualquiera (pedido explícito del diseño aprobado). `lucide-react` no trae un ícono de
 * marca para YouTube, así que es un SVG a mano en vez de un wrapper como el resto de
 * `icons.tsx`.
 */
export function YouTubeMark({ size = 18, className }: YouTubeMarkProps) {
  const triangle = Math.round(size * 0.5);
  return (
    <span
      aria-hidden="true"
      className={clsx('flex shrink-0 items-center justify-center rounded-[5px] bg-danger-500', className)}
      style={{ width: size, height: size }}
    >
      <svg width={triangle} height={triangle} viewBox="0 0 24 24">
        <polygon points="6,4 20,12 6,20" fill="#ffffff" />
      </svg>
    </span>
  );
}
