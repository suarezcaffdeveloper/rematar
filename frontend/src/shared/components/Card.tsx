import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface CardProps {
  children: ReactNode;
  className?: string;
}

/** Contenedor base con el fondo/borde/sombra estándar de la app -- `rounded-xl`, mismo
 * radio que ya usaban de forma repetida (pero sin este componente) la mayoría de las
 * cards de feature (`ActiveLotePanel`, `ModerationPanel`, etc.); unificado acá en el
 * rediseño (Épica 9, Etapa 1) en vez de que cada feature siga repitiendo la clase. */
export function Card({ children, className }: CardProps) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  );
}
