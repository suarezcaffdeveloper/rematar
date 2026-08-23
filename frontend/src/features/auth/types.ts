/**
 * Tipos que reflejan, campo por campo, los schemas de Pydantic del backend
 * (`backend/app/modules/auth/schemas.py`, `backend/app/modules/users/schemas.py`,
 * `backend/app/modules/users/models.py::UserRole`). Mantenidos a mano -- ver
 * docs/24-fundacion-frontend.md, "Trabajo futuro", sobre generación automática.
 */

/**
 * `UserRole` del backend -- son los mismos cuatro valores, ni uno más. Desde ADR-047,
 * `empresa` es quien crea/publica/gestiona remates (lo que hacía `rematador` antes);
 * `rematador` quedó acotado a operar en vivo el remate que una empresa le asignó por
 * código (ver `Remate.rematador_id` en el backend) -- nunca es dueño de un remate.
 */
export type UserRole = 'admin' | 'rematador' | 'comprador' | 'empresa';

/**
 * Roles que se pueden elegir al registrarse (`UserCreate.role` en el backend rechaza
 * "admin" con 422 -- un admin se crea por bootstrap, nunca por registro público, ver
 * ADR-010 del backend). `empresa` y `rematador` sí son auto-registrables, pero nacen
 * `is_active=false` (pendientes de aprobación de un admin, RF-03) -- para que no
 * cualquiera pueda organizar o dirigir remates sin que alguien lo valide antes. `role`
 * en sí no distingue esto: lo hace `User.is_active` en la respuesta del registro (ver
 * `RegisterPage.tsx`/`store.ts`).
 */
export type RegisterableRole = Exclude<UserRole, 'admin'>;

/** Roles cuya cuenta nace pendiente de aprobación (`is_active=false` al registrarse) --
 * mismo criterio que `ROLES_PENDING_APPROVAL` en `backend/app/modules/users/schemas.py`. */
export const ROLES_PENDING_APPROVAL: ReadonlySet<UserRole> = new Set(['empresa', 'rematador']);

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  /** `null` -> avatar por defecto (iniciales). Una URL real (foto subida) o
   * `"preset:<id>"` (avatar predeterminado, ver `shared/lib/avatarPresets.ts`) --
   * `shared/components/UserAvatar.tsx` es el único lugar que interpreta el valor. */
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

/** `Token` -- `backend/app/modules/auth/schemas.py`. */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * `UserCreate` -- `backend/app/modules/users/schemas.py`. Incluye `confirm_password`
 * porque el backend también revalida la coincidencia como defensa en profundidad (no
 * confía solo en el chequeo del formulario) -- pero, igual que en el backend, ese campo
 * nunca se persiste: no existe en `User` (`types.ts`) ni se guarda en ningún lado, solo
 * viaja en este POST puntual para que el backend pueda validarlo.
 */
export interface RegisterPayload {
  email: string;
  password: string;
  confirm_password: string;
  full_name: string;
  phone: string;
  role: RegisterableRole;
}

/** `ForgotPasswordRequest` -- `backend/app/modules/auth/schemas.py`. */
export interface ForgotPasswordPayload {
  email: string;
}

/** `ResetPasswordTokenValidation` -- `backend/app/modules/auth/schemas.py`. */
export interface ResetPasswordTokenPayload {
  token: string;
}

/**
 * `ResetPasswordRequest` -- `backend/app/modules/auth/schemas.py`. Igual que
 * `RegisterPayload.confirm_password`, `confirm_new_password` es puramente de
 * validación (el backend también la revalida) y nunca se persiste.
 */
export interface ResetPasswordPayload {
  token: string;
  new_password: string;
  confirm_new_password: string;
}
