/**
 * Íconos SVG a mano, sin ninguna librería de íconos -- el dashboard necesita un puñado
 * fijo y chico, no vale la pena la dependencia (mismo criterio de ADR-027 sobre mantener
 * el árbol de dependencias chico). Todos son `aria-hidden`: el texto que los acompaña ya
 * transmite la información, son puramente decorativos.
 */

type IconProps = { className?: string };

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10 17.5s6-5.03 6-9.5a6 6 0 1 0-12 0c0 4.47 6 9.5 6 9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function BoxIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M3 6.5 10 3l7 3.5-7 3.5-7-3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M3 6.5V14l7 3.5 7-3.5V6.5M10 10v7.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="m17 17-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 17c0-3.59 2.91-6 6.5-6s6.5 2.41 6.5 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="7" cy="6.5" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 16c0-2.9 2.24-4.75 5-4.75s5 1.85 5 4.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12.5 4.6c1.24.32 2.1 1.32 2.1 2.65 0 1.15-.65 2.05-1.6 2.5 1.55.5 2.5 1.75 2.5 3.62"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GavelIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="m14 4 6 6M2 22l7-7M9.5 9.5 4 15l5 5 5.5-5.5M13 6l5 5 2.5-2.5L15.5 3.5 13 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
