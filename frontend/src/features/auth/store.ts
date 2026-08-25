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
  /** `true` justo después de un `logout()` explícito (botón "Cerrar sesión"), hasta que
   * `RequireAuth` lo consume. Existe porque `Sidebar` no puede simplemente navegar a
   * `/login` tras cerrar sesión: `createBrowserRouter` resuelve `navigate(...)` como una
   * transición de baja prioridad, y el cambio de `isAuthenticated` (una actualización
   * normal) hace que `RequireAuth` vuelva a renderizar con la ruta vieja ("/") antes de
   * que esa transición termine -- su propio `<Navigate to="/remates">` (visitante
   * anónimo, ADR-049) se dispara después y gana la carrera, pisando la navegación a
   * `/login`. Este flag mueve la decisión de destino a `RequireAuth` (donde ya se decide
   * el resto del ruteo por sesión) en vez de competir con él desde afuera. No se
   * persiste (no está en `partialize`): una recarga de página o una pestaña nueva
   * siempre arrancan en `false`, así que solo afecta la transición inmediatamente
   * posterior a tocar "Cerrar sesión" dentro de la misma sesión de la SPA. */
  justLoggedOut: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  /** Devuelve `pendingApproval: true` para empresa/rematador (`is_active=false` al
   * registrarse, RF-03) -- en ese caso NO hay sesión iniciada, `RegisterPage` debe
   * mostrar el estado de "pendiente de aprobación" en vez de navegar como si hubiera
   * logueado. */
  register: (payload: RegisterPayload) => Promise<{ pendingApproval: boolean }>;
  logout: () => void;
  refreshSession: () => Promise<string>;
  /** Mergea `patch` sobre el `user` actual -- para reflejar en el acto un cambio ya
   * confirmado por el backend (ej. `avatar_url` tras `PATCH /users/me`, ver
   * `features/profile`) sin depender de un refetch. No-op si no hay sesión. */
  updateUser: (patch: Partial<User>) => void;
  /** Consumida por `RequireAuth` apenas usa `justLoggedOut` para elegir destino -- para
   * que una visita anónima posterior a "/" en la misma pestaña (ej. volver atrás con el
   * navegador) vuelva a comportarse como cualquier visitante sin sesión (ADR-049), no
   * como si acabara de cerrar sesión. */
  clearJustLoggedOut: () => void;
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
        justLoggedOut: false,

        async login(payload) {
          set({ justLoggedOut: false });
          const tokens = await loginRequest(payload);
          set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
          const user = await fetchCurrentUserRequest();
          set({ user });
        },

        async register(payload) {
          const createdUser = await registerRequest(payload);
          // Empresa/rematador nacen `is_active=false` (pendientes de aprobación de un
          // admin, RF-03) -- intentar loguear ahora daría 401. Comprador sigue
          // logueando de inmediato, como siempre.
          if (!createdUser.is_active) {
            return { pendingApproval: true };
          }
          // El backend no devuelve tokens al registrar, solo el usuario creado -- se
          // encadena un login con la misma contraseña para no pedirle al usuario que
          // la vuelva a escribir. La contraseña no se guarda en ningún estado: vive
          // en el parámetro de esta función y se descarta apenas `login` termina.
          await get().login({ email: payload.email, password: payload.password });
          return { pendingApproval: false };
        },

        logout() {
          const { refreshToken } = get();
          set({ user: null, accessToken: null, refreshToken: null, justLoggedOut: true });
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

        clearJustLoggedOut() {
          set({ justLoggedOut: false });
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
