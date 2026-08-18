/**
 * Llamadas HTTP del feature de auth -- funciones puras, sin estado. `features/auth/store.ts`
 * las orquesta y decide qué hacer con el resultado; este archivo no sabe que existe
 * Zustand. Separarlos así hace que cada mitad se pueda testear por separado (acá,
 * "¿mandamos la request correcta?"; en el store, "¿actualizamos el estado correcto?").
 *
 * Los cuatro endpoints de sesión (login/register/refresh/logout) usan `rawClient`
 * (sin interceptores) a propósito -- ver docstring de `shared/api/client.ts`.
 * `fetchCurrentUser` usa `apiClient`: es un endpoint autenticado más, como cualquiera
 * que un feature futuro vaya a llamar, así que se beneficia del mismo adjuntado
 * automático de token y reintento ante 401 que tendría cualquier otra llamada.
 */

import { apiClient, rawClient } from '../../shared/api/client';
import type {
  AuthTokens,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  ResetPasswordTokenPayload,
  User,
} from './types';

export async function loginRequest(payload: LoginPayload): Promise<AuthTokens> {
  // POST /auth/login espera form-urlencoded (OAuth2PasswordRequestForm), no JSON --
  // "username" es el email, no hay un campo de usuario separado en este sistema.
  const form = new URLSearchParams();
  form.set('username', payload.email);
  form.set('password', payload.password);

  const { data } = await rawClient.post<AuthTokens>('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

export async function registerRequest(payload: RegisterPayload): Promise<User> {
  const { data } = await rawClient.post<User>('/auth/register', payload);
  return data;
}

export async function refreshRequest(refreshToken: string): Promise<AuthTokens> {
  const { data } = await rawClient.post<AuthTokens>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return data;
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  await rawClient.post('/auth/logout', { refresh_token: refreshToken });
}

export async function fetchCurrentUserRequest(): Promise<User> {
  const { data } = await apiClient.get<User>('/users/me');
  return data;
}

// Recuperación de contraseña -- sin sesión todavía (igual que login/register), así que
// usan `rawClient`, mismo criterio que el resto de los endpoints de esta lista.

export async function forgotPasswordRequest(payload: ForgotPasswordPayload): Promise<void> {
  await rawClient.post('/auth/forgot-password', payload);
}

export async function validateResetPasswordTokenRequest(
  payload: ResetPasswordTokenPayload,
): Promise<void> {
  await rawClient.post('/auth/reset-password/validate', payload);
}

export async function resetPasswordRequest(payload: ResetPasswordPayload): Promise<void> {
  await rawClient.post('/auth/reset-password', payload);
}
