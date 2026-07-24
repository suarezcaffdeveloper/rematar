/** SVG a mano, sin librería de íconos -- mismo criterio que `features/chat/components/
 * icons.tsx`. Propios de este feature (no se reusan los de `chat`/`rematador`): evita
 * una dependencia cruzada entre features hermanos sin motivo real. */

interface IconProps {
  className?: string;
}

export function ChartBarIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M4 16V9M10 16V4M16 16v-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
