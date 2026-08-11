import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PhotoFrame } from '../../../shared/components/PhotoFrame';
import { STOCK_PHOTOS, type StockPhoto } from '../../../shared/media/stockPhotos';

const SLIDES: StockPhoto[] = [
  STOCK_PHOTOS.inmuebles,
  STOCK_PHOTOS.ganado,
  STOCK_PHOTOS.vehiculos,
  STOCK_PHOTOS.maquinariaAgricola,
  STOCK_PHOTOS.maquinariaPesada,
  STOCK_PHOTOS.antiguedades,
];

const SLIDE_DURATION_MS = 5000;

/**
 * Bloque visual del registro (columna derecha, ver `RegisterPage.tsx`): mismo patrón
 * de crossfade + zoom leve que `LoginShowcase`, a pantalla completa (misma altura que
 * la columna del formulario). Se duplica en vez de compartir componente con el login
 * porque el texto de portada es distinto -- la reutilización real está en
 * `PhotoFrame` y en el pool de fotos (`shared/media/stockPhotos.ts`).
 *
 * El texto de portada vive anclado a la derecha (`right-0`, alineado a la derecha) a
 * propósito: la tarjeta del formulario se superpone sobre el borde IZQUIERDO de esta
 * imagen (ver `lg:translate-x-[20%]` en `RegisterPage.tsx`), así que dejar el texto
 * del lado derecho evita que la tarjeta lo tape.
 */
export function RegisterShowcase() {
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

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/10 to-brand-900/20" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="absolute bottom-0 right-0 max-w-md p-10 text-right xl:p-12"
      >
        <p className="text-3xl font-bold leading-tight text-white xl:text-4xl">
          Sumate a la nueva forma de <span className="text-brand-300">rematar en vivo.</span>
        </p>

        <div className="mt-8 flex justify-end gap-2">
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
