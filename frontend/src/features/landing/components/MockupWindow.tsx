import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface MockupWindowProps {
  children: ReactNode;
  /** Texto de la barra de dirección simulada, ej. "app.rematar.com/consola". */
  urlLabel?: string;
  className?: string;
  /** `true` para contenido que ya trae su propio fondo/márgenes (una captura real de
   * pantalla) -- sin el padding + fondo slate pensados para las recreaciones con
   * tokens del sistema de diseño. */
  noPadding?: boolean;
}

/**
 * Marco de "ventana de navegador", reutilizado en dos escenarios: recrear pantallas
 * del sistema con los mismos tokens de diseño (`Card`/`Badge`/colores `brand`/`slate`,
 * ver `HeroSection`/`BenefitsSection`) cuando no hay una captura real a mano, y
 * enmarcar capturas reales (`ScreenshotsSection`, con `noPadding`) para que se vean
 * como parte del mismo sistema visual en vez de una imagen suelta.
 */
export function MockupWindow({ children, urlLabel, className, noPadding = false }: MockupWindowProps) {
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-success-300" />
        {urlLabel && (
          <span className="ml-3 truncate rounded-md bg-white px-2.5 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200">
            {urlLabel}
          </span>
        )}
      </div>
      <div className={noPadding ? 'bg-white' : 'bg-slate-50 p-4'}>{children}</div>
    </div>
  );
}
