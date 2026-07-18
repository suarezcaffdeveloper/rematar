/** Íconos propios de la sala -- el resto (calendario, persona, caja) se reusa de
 * `features/remates/components/icons.tsx`, mismo criterio de no duplicar. */

type IconProps = { className?: string };

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
