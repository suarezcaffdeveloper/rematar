/** Íconos propios del chat (Épica 6, Módulo 6.4) -- SVG a mano, sin librería de íconos
 * (ADR-027), mismo criterio que el resto de la app. No se reusan `SendIcon`/`TrashIcon`
 * de `features/rematador/components/icons.tsx` para no invertir la dirección de
 * dependencia: `rematador` ya consume `chat` (Consola Operativa), no al revés. */

type IconProps = { className?: string };

export function SendIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M17 3 3 9.5l6 2.5m8-9-3 12-5-4.5m8-7.5L9 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M4 6h12M8 6V4.5h4V6M6 6l.5 9.5A1 1 0 0 0 7.5 16.5h5a1 1 0 0 0 1-1.03L14 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10 2.5v4l3 3-1 1.5H5.5l-1-1.5 3-3v-4M10 11v6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatBubbleIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3H4.5A1.5 1.5 0 0 1 3 11.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
