/**
 * Cliente HTTP centralizado (Épica 4, Módulo 4.1). Ver docs/24-fundacion-frontend.md y
 * ADR-027 para el detalle completo de decisiones.
 *
 * Dos instancias, a propósito:
 * - `apiClient`: la que usa el resto de la aplicación. Adjunta el access token
 *   automáticamente y reintenta una vez ante un 401 refrescando la sesión.
 * - `rawClient`: sin interceptores. La usa únicamente `features/auth/api.ts` para los
 *   cuatro endpoints de sesión (login, register, refresh, logout) -- estructuralmente
 *   no puede disparar el interceptor de reintento de `apiClient`, así que no hay forma
 *   de que un refresh fallido entre en un loop contra sí mismo.
 *
 * Este módulo no importa el store de auth (`features/auth/store.ts`) directamente --
 * eso crearía un ciclo (`store.ts` -> `api.ts` -> `client.ts` -> `store.ts`). En cambio,
 * expone `registerSessionAccessor`: el store se registra a sí mismo acá una única vez,
 * después de crearse (inversión de dependencias) -- este módulo sigue sin saber qué es
 * Zustand ni cómo se gestiona la sesión, solo que "algo" le puede dar un token y
 * refrescar la sesión cuando se lo pidan.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';

export interface SessionAccessor {
  getAccessToken: () => string | null;
  refreshSession: () => Promise<string>;
  onRefreshFailed: () => void;
}

let sessionAccessor: SessionAccessor | null = null;

export function registerSessionAccessor(accessor: SessionAccessor): void {
  sessionAccessor = accessor;
}

/**
 * Lectura del access token vigente, para cualquier transporte que no sea `apiClient`
 * (Épica 4, Módulo 4.6 -- el cliente WebSocket de `shared/websocket/client.ts` necesita
 * el mismo JWT para el mensaje `auth`, ver ADR-006). Misma inversión de dependencias que
 * `registerSessionAccessor`: este módulo sigue sin importar el store de auth.
 */
export function getSessionAccessToken(): string | null {
  return sessionAccessor?.getAccessToken() ?? null;
}

const SESSION_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

function isSessionEndpoint(url?: string): boolean {
  return Boolean(url) && SESSION_ENDPOINTS.some((path) => url!.includes(path));
}

export const rawClient = axios.create({
  baseURL: env.apiBaseUrl,
});

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
});

apiClient.interceptors.request.use((config) => {
  const token = sessionAccessor?.getAccessToken();
  if (token && !isSessionEndpoint(config.url)) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// Single-flight: el backend rota el refresh token en cada uso (ver
// docs/adr/ADR-011-refresh-tokens-persistidos-en-postgres.md, en la raíz del repo) --
// si dos
// requests concurrentes dispararan cada una su propio refresh, la segunda invalidaría
// el token que la primera todavía no terminó de usar. Toda request que necesite
// refrescar mientras hay un refresh en vuelo espera la MISMA promesa.
let refreshPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;

    if (
      error.response?.status !== 401 ||
      !config ||
      config._retried ||
      isSessionEndpoint(config.url) ||
      !sessionAccessor
    ) {
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      refreshPromise ??= sessionAccessor.refreshSession().finally(() => {
        refreshPromise = null;
      });
      const newAccessToken = await refreshPromise;
      config.headers.set('Authorization', `Bearer ${newAccessToken}`);
      return apiClient(config);
    } catch (refreshError) {
      sessionAccessor.onRefreshFailed();
      return Promise.reject(refreshError);
    }
  },
);
