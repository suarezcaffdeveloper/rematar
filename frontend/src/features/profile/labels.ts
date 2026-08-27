import type { UserRole } from '../auth/types';

/** Texto de presentación para `UserRole` en la pantalla de perfil -- mismo criterio que
 * `features/chat/labels.ts` (no hay un mapeo compartido todavía, ver su docstring). */
export const PROFILE_ROLE_LABELS: Record<UserRole, string> = {
  comprador: 'Comprador',
  rematador: 'Martillero',
  empresa: 'Empresa',
  admin: 'Administrador',
};
