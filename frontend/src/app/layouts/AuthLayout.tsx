import { Outlet } from 'react-router-dom';

/**
 * Layout de las pantallas de autenticación (`/login`, `/register`, `/forgot-password`,
 * `/reset-password`) -- sin navegación ni datos de sesión (todavía no hay sesión en estas
 * pantallas por definición). Cada una arma su propia composición a pantalla completa con
 * `features/auth/components/cinematic/CinematicShell`, así que acá sólo se renderiza la ruta.
 */
export function AuthLayout() {
  return <Outlet />;
}
