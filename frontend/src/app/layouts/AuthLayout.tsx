import { Outlet, useLocation } from 'react-router-dom';

const FULL_BLEED_PATHS = ['/login', '/register'];

/**
 * Layout para pantallas de autenticación (`/login`, `/register`) -- sin navegación ni
 * datos de sesión (todavía no hay sesión en estas pantallas por definición).
 *
 * Ambas rutas son casos especiales: `LoginPage` y `RegisterPage` (rediseño premium,
 * dos columnas a pantalla completa) arman su propia composición de punta a punta, así
 * que acá se les da el `<Outlet />` desnudo, sin el header + tarjeta centrada
 * genérica de abajo -- esa queda como fallback por si algún día se agrega otra
 * pantalla de auth simple (ej. "olvidé mi contraseña") que sí quiera ese formato.
 */
export function AuthLayout() {
  const location = useLocation();

  if (FULL_BLEED_PATHS.includes(location.pathname)) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">RematAR</h1>
        <p className="text-sm text-slate-500">Remates en vivo, en tiempo real</p>
      </div>
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
