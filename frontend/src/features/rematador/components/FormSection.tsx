import type { ReactNode } from 'react';

/** Bloque de sección compartido por los formularios de Remate y Lote (mismo lenguaje
 * visual, Épica 9) -- card redondeada con título, usada dentro de `RemateFormModal` y
 * `LoteFormModal`. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  );
}
