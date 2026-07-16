/**
 * Tipos que reflejan, campo por campo, los schemas de Pydantic del backend
 * (`backend/app/modules/auth/schemas.py`, `backend/app/modules/users/schemas.py`,
 * `backend/app/modules/users/models.py::UserRole`). Mantenidos a mano -- ver
 * docs/24-fundacion-frontend.md, "Trabajo futuro", sobre generación automática.
 */

/** `UserRole` del backend -- son los mismos tres valores, ni uno más. */
export type UserRole = 'admin' | 'rematador' | 'comprador';

/**
 * Roles que se pueden elegir al registrarse (`UserCreate.role` en el backend rechaza
 * "admin" con 422 -- un admin se crea por bootstrap, nunca por registro público, ver
 * ADR-010 del backend). El tipo lo refleja: `RegisterPayload.role` no puede ser "admin"
 * ni en tiempo de compilación.
 */
export type RegisterableRole = Exclude<UserRole, 'admin'>;

export interface User {
  id: string;
  email: string;
  full_name: string;
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

/** `UserCreate` -- `backend/app/modules/users/schemas.py`. */
export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  role: RegisterableRole;
}
