import { useState, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * Foto flotante que sigue al cursor sobre una lista (mismo efecto que "Todos los remates"
 * del inicio): `bind` se esparce en el `<ul>` y `rowProps(item)` en cada fila; `renderPreview`
 * dibuja la foto del elemento con el mouse encima. Es una función que devuelve JSX (no un componente) a
 * propósito: así `AnimatePresence` conserva su lugar en el árbol entre renders y la
 * animación de salida funciona.
 */
export function useCursorPreview<T>() {
  const [hovered, setHovered] = useState<T | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 32, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 320, damping: 32, mass: 0.6 });

  return {
    hovered,
    bind: {
      onMouseMove: (e: MouseEvent) => {
        x.set(e.clientX + 28);
        y.set(e.clientY - 96);
      },
      onMouseLeave: () => setHovered(null),
    },
    rowProps: (item: T) => ({
      onMouseEnter: (e: MouseEvent) => {
        x.jump(e.clientX + 28);
        y.jump(e.clientY - 96);
        if (hovered === null) {
          sx.jump(e.clientX + 28);
          sy.jump(e.clientY - 96);
        }
        setHovered(item);
      },
      onFocus: () => setHovered(item),
      onBlur: () => setHovered(null),
    }),
    renderPreview: (children: (item: T) => ReactNode) => (
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="preview"
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-30 hidden h-44 w-60 overflow-hidden rounded-xl bg-surface-subtle shadow-2xl ring-1 ring-black/5 md:block"
            style={{ x: sx, y: sy }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
          >
            {children(hovered)}
          </motion.div>
        )}
      </AnimatePresence>
    ),
  };
}
