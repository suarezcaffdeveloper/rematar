/**
 * Hooks de conveniencia sobre `useAuthStore`. Usan `useShallow` a propósito: un
 * selector que devuelve un objeto nuevo en cada llamada (`{ user, isAuthenticated }`)
 * haría que el componente vuelva a renderizar en CADA cambio del store, sin importar
 * si el campo que le importa cambió -- exactamente el problema que Zustand (con
 * selectores) está pensado para evitar (ver ADR-027). `useShallow` compara
 * campo por campo en vez de por identidad del objeto.
 */

import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from './store';

export function useAuth() {
  return useAuthStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: Boolean(state.accessToken),
      isHydrated: state.isHydrated,
      justLoggedOut: state.justLoggedOut,
    })),
  );
}

export function useAuthActions() {
  return useAuthStore(
    useShallow((state) => ({
      login: state.login,
      register: state.register,
      logout: state.logout,
      updateUser: state.updateUser,
      clearJustLoggedOut: state.clearJustLoggedOut,
    })),
  );
}
