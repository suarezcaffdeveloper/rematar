/** Íconos propios de la Gestión de Remates y Lotes (Épica 5, Módulo 5.3) -- acciones de
 * edición/CRUD que ninguna otra pantalla necesitaba hasta ahora (`features/remates/
 * components/icons.tsx` se mantiene con los íconos de solo-visualización). `ChevronDownIcon` se
 * reusa de `features/audit/components/icons.tsx` (mismo criterio de no duplicar que ya
 * aplica `features/sala/`: `rematador` ya consume `audit` en `RemateAuditLogPage`, así
 * que la dirección de dependencia es segura). `PlusIcon` migrado a `lucide-react` en la
 * Etapa 3 del rediseño (ADR-046, único ícono de este archivo usado en el dashboard); el
 * resto sigue a mano hasta que la pantalla que los usa se rediseñe. */

import { Plus } from 'lucide-react';

type IconProps = { className?: string };

export function PlusIcon({ className }: IconProps) {
  return <Plus aria-hidden="true" className={className} />;
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="m13.5 3.5 3 3L7 16H4v-3L13.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
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

export function CopyIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 12.5v-7A1.5 1.5 0 0 1 6 4h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GripVerticalIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <circle cx="7" cy="5" r="1.3" />
      <circle cx="7" cy="10" r="1.3" />
      <circle cx="7" cy="15" r="1.3" />
      <circle cx="13" cy="5" r="1.3" />
      <circle cx="13" cy="10" r="1.3" />
      <circle cx="13" cy="15" r="1.3" />
    </svg>
  );
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path d="m5.5 12.5 4.5-5 4.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path d="m12.5 5.5-4.5 4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path d="m7.5 5.5 4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Auditoría (Épica 7, Módulo 7.2) -- reloj con flecha de "historial". */
export function HistoryIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M4 10a6 6 0 1 0 1.8-4.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.5 4v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 7v3l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} className={className}>
      <path
        d="m10 3 2.1 4.4 4.9.7-3.5 3.4.8 4.9-4.3-2.3-4.3 2.3.8-4.9-3.5-3.4 4.9-.7L10 3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="m3 10 14-7-5 14-2.5-6-6.5-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
