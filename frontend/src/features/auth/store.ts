/**
 * Estado de sesión, global a toda la app (Épica 4, Módulo 4.1). Ver
 * docs/24-fundacion-frontend.md y ADR-027 para por qué Zustand y no Context API.
 *
 * Persistencia: `accessToken`, `refreshToken` y `user` se guardan en `localStorage`
 * (`zustand/middleware/persist`) para que refrescar la página no cierre la sesión.
 * Tradeoff aceptado y documentado en ADR-027: `localStorage` es legible por cualquier
 * script que logre correr en la página (XSS) -- la alternativa real (cookies
 * `httpOnly`) requiere que el backend las emita, y este módulo tiene prohibido tocar
 * el backend. Se mitiga con el access token de vida corta (30 min) y la rotación de
 * refresh tokens que el backend ya implementa.
 *
 * `isHydrated` existe porque `RequireAuth` (shared/guards/RequireAuth.tsx) necesita
 * distinguir "todavía no sabemos si hay sesión" de "sabemos que no hay sesión" -- sin
 * este flag, redirigiría a `/login` en el primer render tras refrescar la página,
 * incluso cuando el token persistido va a terminar de cargar un instante después.
 *
 * Detalle no obvio: `onRehydrateStorage` (abajo) **no puede** referenciar la propia
 * constante `useAuthStore`. Con `localStorage` (síncrono), Zustand ejecuta el
 * callback de rehidratación de forma síncrona, DURANTE la llamada a `create(...)` --
 * antes de que `const useAuthStore = create(...)` termine de asignarse -- así que
 * `useAuthStore` todavía está en zona muerta temporal (`ReferenceError`) en ese
 * instante. Por eso acá se captura `set` directamente del creator (que sí corre antes
 * de la rehidratación) en vez de llamar `useAuthStore.setState(...)`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { registerSessionAccessor } from '../../shared/api/client';
import {
  fetchCurrentUserRequest,
  loginRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
} from './api';
import type { LoginPayload, RegisterPayload, User } from './types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<string>;
  /** Mergea `patch` sobre el `user` actual -- para reflejar en el acto un cambio ya
   * confirmado por el backend (ej. `avatar_url` tras `PATCH /users/me`, ver
   * `features/profile`) sin depender de un refetch. No-op si no hay sesión. */
  updateUser: (patch: Partial<User>) => void;
}

// Ver el comentario de arriba: capturado para que `onRehydrateStorage` pueda marcar
// `isHydrated` sin referenciar `useAuthStore` mientras todavía se está creando.
let setAuthState: ((partial: Partial<AuthState>) => void) | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      setAuthState = set;
      return {
        user: null,
        accessToken: null,
        refreshToken: null,
        isHydrated: false,

        async login(payload) {
          const tokens = await loginRequest(payload);
          set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
          const user = await fetchCurrentUserRequest();
          set({ user });
        },

        async register(payload) {
          await registerRequest(payload);
          // El backend no devuelve tokens al registrar, solo el usuario creado -- se
          // encadena un login con la misma contraseña para no pedirle al usuario que
          // la vuelva a escribir. La contraseña no se guarda en ningún estado: vive
          // en el parámetro de esta función y se descarta apenas `login` termina.
          await get().login({ email: payload.email, password: payload.password });
        },

        logout() {
          const { refreshToken } = get();
          set({ user: null, accessToken: null, refreshToken: null });
          if (refreshToken) {
            // Best-effort: el estado local ya se limpió. Si el logout en el servidor
            // falla (token ya vencido/revocado, red caída), no cambia nada del lado
            // del cliente -- no hay nada más que deshacer.
            void logoutRequest(refreshToken).catch(() => undefined);
          }
        },

        updateUser(patch) {
          const current = get().user;
          if (!current) return;
          set({ user: { ...current, ...patch } });
        },

        async refreshSession() {
          const { refreshToken } = get();
          if (!refreshToken) {
            throw new Error('No hay sesión activa para refrescar.');
          }
          const tokens = await refreshRequest(refreshToken);
          set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
          return tokens.access_token;
        },
      };
    },
    {
      name: 'rematar-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      onRehydrateStorage: () => () => {
        setAuthState?.({ isHydrated: true });
      },
    },
  ),
);

// Inversión de dependencias con shared/api/client.ts -- ver el docstring de ese
// archivo para por qué no se importa `apiClient`/`rawClient` con un import circular.
// Estas SÍ pueden referenciar `useAuthStore`: son closures que solo se ejecutan ante
// una request HTTP real, mucho después de que el módulo termine de evaluarse.
registerSessionAccessor({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshSession: () => useAuthStore.getState().refreshSession(),
  onRefreshFailed: () => useAuthStore.getState().logout(),
});
