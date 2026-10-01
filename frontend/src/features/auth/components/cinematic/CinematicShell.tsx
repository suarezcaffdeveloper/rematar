import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import logoRematar from '../../../../assets/brand/logo-rematar.png';
import type { StockPhoto } from '../../../../shared/media/stockPhotos';

// Clases completas (no armadas con template) para que Tailwind las detecte.
const GRID_COLUMNS = {
  login: 'lg:grid-cols-[1fr_27rem] xl:grid-cols-[1fr_29rem]',
  register: 'lg:grid-cols-[1fr_34rem] xl:grid-cols-[1fr_36rem]',
} as const;

export interface CinematicShellProps {
  /** Foto de fondo; al cambiar `photoKey` hace crossfade a la nueva. */
  photo: StockPhoto;
  photoKey: string;
  /** Segundos que dura el zoom lento de cada foto (conviene que sea un poco más que el tiempo que está en pantalla). */
  zoomSeconds?: number;
  size: keyof typeof GRID_COLUMNS;
  /** Contenido de la derecha del encabezado (un link). */
  headerAction: ReactNode;
  /** Columna izquierda (titular, carrusel); sólo desde `lg`. */
  aside: ReactNode;
  /** Contenido del panel de vidrio. */
  children: ReactNode;
}

/**
 * Marco compartido por login y registro: fotografía a pantalla completa con zoom lento,
 * encabezado con el logo, una columna editorial a la izquierda y el formulario en un panel de
 * vidrio a la derecha. El fondo queda fijo: si el formulario es más alto que la pantalla
 * (registro en mobile), sólo se desplaza el contenido.
 */
export function CinematicShell({
  photo,
  photoKey,
  zoomSeconds = 14,
  size,
  headerAction,
  aside,
  children,
}: CinematicShellProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-ink font-display text-white">
      <AnimatePresence mode="sync">
        <motion.div
          key={photoKey}
          className="fixed inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.3, ease: 'easeInOut' }}
        >
          <motion.img
            src={photo.url}
            alt=""
            className="h-full w-full object-cover"
            onError={(event) => {
              // Si una foto externa no carga, queda el fondo oscuro en vez de un ícono roto.
              event.currentTarget.style.visibility = 'hidden';
            }}
            initial={{ scale: 1.04 }}
            animate={{ scale: reduceMotion ? 1.04 : 1.14 }}
            transition={{ duration: zoomSeconds, ease: 'linear' }}
          />
        </motion.div>
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-ink/90 via-ink/60 to-ink/40" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/50" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-14">
        <Link to="/" aria-label="RematAR, ir al inicio">
          <img src={logoRematar} alt="RematAR" className="h-8 w-auto brightness-0 invert" />
        </Link>
        {headerAction}
      </header>

      <main
        className={`relative z-10 mx-auto grid w-full max-w-[88rem] flex-1 items-center gap-12 px-6 pb-10 pt-4 sm:px-10 lg:px-14 ${GRID_COLUMNS[size]}`}
      >
        <div className="hidden lg:block">{aside}</div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-3xl bg-white/[0.08] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/20 backdrop-blur-2xl sm:p-9"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
