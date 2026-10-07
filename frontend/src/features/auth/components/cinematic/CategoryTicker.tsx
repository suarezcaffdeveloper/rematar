import { AUTH_RUBROS } from './authRubros';

export interface CategoryTickerProps {
  index: number;
  onSelect: (index: number) => void;
  durationMs: number;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
}

/**
 * Versión compacta de `CategoryCarousel` para las pantallas donde la columna izquierda ya tiene
 * bastante contenido (registro, recuperación): el nombre del rubro de la foto de fondo, su barra
 * de progreso y un punto por rubro para saltar a otro.
 */
export function CategoryTicker({ index, onSelect, durationMs, paused, onPausedChange }: CategoryTickerProps) {
  const active = AUTH_RUBROS[index];

  return (
    <div
      role="group"
      aria-label="Rubros"
      className="mt-10 max-w-md"
      onMouseEnter={() => onPausedChange(true)}
      onMouseLeave={() => onPausedChange(false)}
    >
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Rematamos</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{active.label}</p>
      <span className="relative mt-3 block h-px w-48 overflow-hidden bg-white/20">
        <span
          key={index}
          className={`absolute inset-0 origin-left bg-white ${paused ? '' : 'animate-stage-progress'}`}
          style={{ ['--stage-duration' as string]: `${durationMs}ms` }}
        />
      </span>
      <div className="mt-4 flex gap-2">
        {AUTH_RUBROS.map((rubro, i) => (
          <button
            key={rubro.category}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={rubro.fullLabel}
            aria-current={i === index ? 'true' : undefined}
            className={`h-1.5 rounded-full transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
