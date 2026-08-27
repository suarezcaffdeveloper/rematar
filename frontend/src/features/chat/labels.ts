/** Texto de presentación para `UserRole` en el chat -- mismo criterio que
 * `features/remates/labels.ts`. No existe todavía un mapeo con los tres roles
 * (incluido `admin`) en ningún otro lugar de la app (`RegisterPage` solo lista los dos
 * roles auto-registrables). */

import type { UserRole } from '../auth/types';

export const CHAT_ROLE_LABELS: Record<UserRole, string> = {
  comprador: 'Comprador',
  rematador: 'Martillero',
  empresa: 'Empresa',
  admin: 'Administrador',
};
