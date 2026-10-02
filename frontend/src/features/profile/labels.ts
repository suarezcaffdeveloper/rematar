import type { UserRole } from '../auth/types';

/** Texto de presentación para `UserRole` en la pantalla de perfil -- mismo criterio que
 * `features/chat/labels.ts` (no hay un mapeo compartido todavía, ver su docstring). */
export const PROFILE_ROLE_LABELS: Record<UserRole, string> = {
  comprador: 'Comprador',
  rematador: 'Martillero',
  empresa: 'Empresa',
  admin: 'Administrador',
};

/** Una línea bajo el nombre en la cabecera de "Mi perfil": para qué sirve la cuenta según el rol. */
export const PROFILE_ROLE_LEADS: Record<UserRole, string> = {
  comprador: 'Tu cuenta para ofertar en remates y seguir lo que ganaste.',
  empresa: 'La cuenta con la que publicás y gestionás los remates de tu empresa.',
  rematador: 'La cuenta con la que dirigís en vivo los remates que te asignan.',
  admin: 'La cuenta con la que administrás usuarios y remates de RematAR.',
};
