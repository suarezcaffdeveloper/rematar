import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks';
import { Spinner } from '../components/Spinner';

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
 *
 * Excepción a todo lo anterior: `justLoggedOut` (`features/auth/store.ts`). Un cierre de
 * sesión explícito (botón "Cerrar sesión") siempre termina en `/login`, sin importar en
 * qué ruta estaba parado -- ni "/" ni ninguna de las rutas públicamente visibles de
 * arriba. Esta decisión vive ACÁ (no en un `navigate('/login')` imperativo desde
 * `Sidebar`) a propósito: `createBrowserRouter` resuelve `navigate(...)` como una
 * transición de baja prioridad, así que un `navigate` disparado desde afuera justo antes
 * de cerrar sesión pierde la carrera contra el `<Navigate>` que este mismo componente
 * dispararía por su cuenta al ver `isAuthenticated=false` en "/" -- terminaba pisado por
 * el visitante-anónimo de ADR-049 (bug real, visto en pruebas manuales). Con la decisión
 * tomada acá mismo, en el único lugar que ya resuelve el resto del ruteo por sesión, no
 * hay dos navegaciones compitiendo.
 *
 * El flag se apaga recién en el próximo `login()` (ver `features/auth/store.ts`), NO acá
 * con un `useEffect` propio: un efecto que lo apagara en cuanto este componente lo lee
 * dispara un segundo render con `justLoggedOut=false` ANTES de que la transición de ruta
 * a `/login` (disparada por el `<Navigate>` de arriba, también asincrónica) termine de
 * aplicarse -- ese segundo render vuelve a caer en la rama de "/" y pisa el redirect con
 * `/remates` otra vez (mismo bug de fondo, solo que un paso más adelante). No se
 * persiste (no está en `partialize`) -- una pestaña nueva o un refresh siempre arrancan
 * en `false`, así que como mucho queda "pegado" en `true` hasta el próximo login dentro
 * de la misma pestaña (ej. si el usuario vuelve atrás con el navegador justo después de
 * cerrar sesión) -- riesgo aceptado, mucho más barato que la alternativa de reintroducir
 * una segunda transición compitiendo.
 */
export function RequireAuth() {
  const { isAuthenticated, isHydrated, justLoggedOut } = useAuth();
  const location = useLocation();

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (justLoggedOut) {
      return <Navigate to="/login" replace />;
    }
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
