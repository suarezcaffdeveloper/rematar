import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks';
import { Spinner } from '../components/Spinner';
import { LandingPage } from '../../features/landing/pages/LandingPage';

// Visitante anónimo (ADR-049): el listado público de remates (`/remates`, punto de
// entrada de "ver como invitado" desde `LoginPage`), el detalle público de un remate
// (`/remates/{id}`) y su sala en vivo (`/remates/{id}/sala`, WebSocket ya acepta
// conexiones sin token -- ver `shared/websocket/client.ts` y
// `backend/app/websocket/auth.py`). El resto de sub-rutas (`/gestionar`, `/lotes`,
// `/auditoria`, etc.) siguen exigiendo sesión.
const ANONYMOUS_VIEWABLE_PATTERNS = [/^\/remates$/, /^\/remates\/[^/]+$/, /^\/remates\/[^/]+\/sala$/];

function isPubliclyViewablePath(pathname: string): boolean {
  return ANONYMOUS_VIEWABLE_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Envuelve un grupo de rutas (`app/router.tsx`) que exigen sesión iniciada. Redirige a
 * `/login` sin guardar la ruta original: `LoginPage` siempre vuelve a `/` después de
 * autenticar (que ya reparte por rol, ver `HomePage`), nunca a la ruta que se estaba
 * intentando visitar. Antes se guardaba en `location.state.from` para volver ahí, pero
 * esa ruta queda pegada a la ENTRADA del historial de `/login`, no a la sesión: si un
 * usuario quedaba deslogueado en una ruta específica (p.ej. `/remates/:id/gestionar`,
 * que no tiene `RequireRole`) y otro usuario con OTRO rol se logueaba después en la
 * misma pestaña, terminaba viendo el panel del primero. Ver el docstring de
 * `LoginPage`.
 *
 * Espera a `isHydrated` antes de decidir: `useAuthStore` persiste en `localStorage` y
 * rehidrata de forma asíncrona (ver docstring de `features/auth/store.ts`) -- sin este
 * chequeo, refrescar la página en una ruta protegida redirigiría a `/login` por una
 * fracción de segundo aunque la sesión siga siendo válida.
 *
 * Dos casos especiales para un visitante sin sesión (ADR-049): "/" (landing pública, ver
 * `features/landing`) ve la landing en vez de ser mandado a `/login`; el listado público
 * de remates, el detalle de un remate real y su sala en vivo (`/remates`,
 * `/remates/:id`, `/remates/:id/sala`, ver `isPubliclyViewablePath`) dejan pasar el
 * `Outlet` tal cual -- entran a `AppLayout`
 * igual que un usuario logueado (`Sidebar`/`Header` ya degradan sin `user`, ver sus
 * propios componentes), y es el propio backend el que decide si ESE remate puntual es
 * visible sin sesión (`RemateService._is_visible` con `viewer=None` por REST,
 * `authenticate_connection` con `token=None` por WebSocket) -- esta ruta no intenta
 * adivinarlo. Ofertar sigue exigiendo sesión (`PlaceBidButton` redirige a `/login` si
 * no hay `viewerRole`). Cualquier otra ruta protegida sigue redirigiendo a `/login`
 * exactamente igual que antes, y un usuario autenticado sigue viendo su dashboard en
 * "/" sin ningún cambio (sigue siendo la ruta `index` de `AppLayout`) -- por eso todos
 * los `navigate('/')` ya existentes en la app (botones "volver al inicio") no se ven
 * afectados.
 */
export function RequireAuth() {
  const { isAuthenticated, isHydrated } = useAuth();
  const location = useLocation();

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (location.pathname === '/') {
      return <Navigate to="/remates" replace />;
    }
    if (isPubliclyViewablePath(location.pathname)) {
      return <Outlet />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
