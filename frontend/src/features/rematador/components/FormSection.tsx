import type { ReactNode } from 'react';

/** Bloque de sección compartido por los formularios de Remate y Lote (mismo lenguaje
 * visual, Épica 9) -- usado dentro de `RemateFormModal` y `LoteFormModal`.
 *
 * Retexturizado sobre el sistema de diseño más reciente (mismo criterio "no todas cajas"
 * que ya aplica `ConsolaControlPanel`/`ControlSection`): antes cada sección era su propia
 * card blanca con sombra -- ahora es un divisor `border-t border-line` + un label chico
 * en mayúsculas (`text-ink-faint`), para que un formulario largo se lea como un único
 * flujo en vez de una pila de cajas apiladas. La card sí la sigue poniendo el `Modal` que
 * envuelve todo el formulario -- no hace falta anidar otra. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}
