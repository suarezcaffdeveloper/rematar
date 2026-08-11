import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PhotoFrame } from '../../../shared/components/PhotoFrame';
import { STOCK_PHOTOS, type StockPhoto } from '../../../shared/media/stockPhotos';

const SLIDES: StockPhoto[] = [
  STOCK_PHOTOS.ganado,
  STOCK_PHOTOS.maquinariaAgricola,
  STOCK_PHOTOS.inmuebles,
  STOCK_PHOTOS.vehiculos,
  STOCK_PHOTOS.maquinariaPesada,
  STOCK_PHOTOS.antiguedades,
];

const SLIDE_DURATION_MS = 5000;

/**
 * Columna visual del login (60%, ver `LoginPage.tsx`): collage de fotografías reales
 * de distintos rubros de remate, con crossfade automático + zoom leve tipo "Ken
 * Burns". Mismo pool de fotos que la landing (`shared/media/stockPhotos.ts`) --
 * consistencia de identidad visual entre la landing pública y el login.
 */
export function LoginShowcase() {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900">
      <AnimatePresence mode="sync">
        <motion.div
          key={index}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        >
          <motion.div
            className="h-full w-full"
            initial={{ scale: 1 }}
            animate={{ scale: prefersReducedMotion ? 1 : 1.08 }}
            transition={{ duration: (SLIDE_DURATION_MS + 1100) / 1000, ease: 'linear' }}
          >
            <PhotoFrame photo={SLIDES[index]} rounded="rounded-none" className="h-full w-full" />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-brand-900/30" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="absolute inset-x-0 bottom-0 p-12"
      >
        <p className="max-w-md text-3xl font-bold leading-tight text-white xl:text-4xl">
          Todo tipo de remates. <span className="text-brand-300">Una única plataforma.</span>
        </p>
        <p className="mt-4 max-w-md text-sm text-slate-200">
          Ganadería, maquinaria, inmuebles, vehículos y coleccionables -- gestionados en
          vivo, con la misma experiencia profesional.
        </p>

        <div className="mt-8 flex gap-2">
          {SLIDES.map((slide, slideIndex) => (
            <span
              key={slide.url}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                slideIndex === index ? 'w-8 bg-white' : 'w-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
