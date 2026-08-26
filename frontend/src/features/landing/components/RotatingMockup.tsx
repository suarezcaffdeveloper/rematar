import { type ReactNode, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import { MockupWindow } from './MockupWindow';

export interface MockupScene {
  key: string;
  /** Etiqueta corta debajo del marco -- qué pantalla del sistema es esta escena. */
  label: string;
  /** Texto de la barra de dirección simulada, ej. "app.rematar.com/remates/sala". */
  urlLabel: string;
  content: ReactNode;
}

export interface RotatingMockupProps {
  scenes: MockupScene[];
  intervalMs?: number;
  className?: string;
}

const SCENE_HEIGHT = 320;

/**
 * Visual compartido por las tres secciones de beneficios (empresa/rematador/comprador,
 * `LandingPage`) -- recreación con los tokens del sistema de diseño (no una captura real,
 * ver `MockupWindow`) que va rotando sola entre varias escenas propias del rol, cada una
 * mostrando una pantalla/función real de la app (reemplaza el video único de
 * `RematadorConsoleMockup` y la captura estática de `CompradorSalaMockup` -- pedido
 * explícito: mismo lenguaje visual recreado para las tres secciones, en vez de mezclar
 * video real + captura real + mockup, y mostrando más de una pantalla por rol).
 *
 * Las escenas quedan todas montadas y se cruzan por opacidad (mismo criterio que el
 * carrusel de `ScreenshotsSection`, sin `AnimatePresence`: con un solo hijo dinámico
 * `AnimatePresence` puede quedarse mostrando el contenido de una escena vieja mientras la
 * etiqueta/URL de abajo ya avanzaron a la siguiente si el índice cambia de nuevo antes de
 * que la transición de salida termine -- montar las N escenas fijas y cruzarlas por CSS
 * evita ese problema por completo).
 *
 * Se pausa con hover/foco (`WCAG 2.2.2`) y no rota sola si `prefers-reduced-motion` está
 * activo -- los puntos siguen permitiendo navegar manualmente en ese caso.
 */
export function RotatingMockup({ scenes, intervalMs = 4200, className }: RotatingMockupProps) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const total = scenes.length;
  const active = scenes[index];

  useEffect(() => {
    if (isPaused || prefersReducedMotion || total <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % total), intervalMs);
    return () => window.clearInterval(id);
  }, [isPaused, prefersReducedMotion, total, intervalMs]);

  return (
    <div
      className={className}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <MockupWindow urlLabel={active.urlLabel} noPadding>
        <div className="relative overflow-hidden bg-slate-50" style={{ height: SCENE_HEIGHT }}>
          {scenes.map((scene, i) => (
            <div
              key={scene.key}
              aria-hidden={i !== index}
              className="absolute inset-0 flex flex-col p-4"
              style={{
                opacity: i === index ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: i === index ? 'auto' : 'none',
              }}
            >
              {scene.content}
            </div>
          ))}
        </div>
      </MockupWindow>

      <div className="mt-4 flex items-center justify-center gap-2">
        {scenes.map((scene, i) => (
          <button
            key={scene.key}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Ver: ${scene.label}`}
            aria-current={i === index}
            className={clsx(
              'h-1.5 rounded-full transition-all duration-300',
              i === index ? 'w-6 bg-brand-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400',
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs font-medium text-slate-500">{active.label}</p>
    </div>
  );
}
