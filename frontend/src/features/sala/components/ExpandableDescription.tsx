import { useLayoutEffect, useRef, useState } from 'react';

export interface ExpandableDescriptionProps {
  /** Texto a mostrar; `null` muestra el aviso de que todavía no hay descripción. */
  text: string | null;
  /** Cambia cuando se pasa a otro lote: la descripción vuelve a arrancar recortada. */
  resetKey: string;
  /** Renglones a los que se recorta antes de "Ver más". Default: tres. */
  lines?: 3 | 4;
  className?: string;
}

/**
 * La descripción de un lote, recortada a unos renglones y, SOLO si de verdad no entra,
 * con "Ver más" para desplegarla: el recorte se mide (no se adivina por cantidad de
 * caracteres) y vuelve a medirse si cambia el ancho de la columna. Al desplegar se
 * respetan los saltos de párrafo de la empresa.
 */
export function ExpandableDescription({ text, resetKey, lines = 3, className = '' }: ExpandableDescriptionProps) {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const [previousKey, setPreviousKey] = useState(resetKey);
  if (resetKey !== previousKey) {
    setPreviousKey(resetKey);
    setOpen(false);
  }

  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    const measure = () => {
      if (!open) setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, text]);

  return (
    <div className={className}>
      <p
        ref={descriptionRef}
        className={`max-w-2xl text-sm leading-relaxed text-ink-muted ${
          open ? 'whitespace-pre-line' : lines === 4 ? 'line-clamp-4' : 'line-clamp-3'
        }`}
      >
        {text ?? 'Este lote todavía no tiene una descripción cargada.'}
      </p>
      {(overflowing || open) && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="mt-1 rounded text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {open ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}
