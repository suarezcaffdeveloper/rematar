import { Link, Outlet, useLocation } from 'react-router-dom';
import { Gavel } from 'lucide-react';
import { LoginShowcase } from '../../features/auth/components/LoginShowcase';

const FULL_BLEED_PATHS = ['/login', '/register'];

/**
 * Layout para pantallas de autenticación (`/login`, `/register`) -- sin navegación ni
 * datos de sesión (todavía no hay sesión en estas pantallas por definición).
 *
 * `/login`/`/register` arman su propia composición de punta a punta (dos columnas a
 * pantalla completa) y reciben el `<Outlet />` desnudo. El resto de las pantallas de
 * auth simples (`/forgot-password`, `/reset-password`) usan el fallback de abajo --
 * mismo esqueleto de dos columnas que Login/Register (logo, tipografía, columna de
 * fotos vía `LoginShowcase`) para que no se sientan una pantalla de otra app; solo
 * cambia el contenido, que sigue siendo la card angosta que ya traía cada página.
 */
export function AuthLayout() {
  const location = useLocation();

  if (FULL_BLEED_PATHS.includes(location.pathname)) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative flex w-full flex-col justify-center overflow-hidden bg-white px-6 py-12 sm:px-12 md:w-2/3 lg:w-2/5 lg:px-16 xl:px-20">
        <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-brand-50 blur-3xl" />

        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Gavel className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold tracking-tight text-brand-700">RematAR</span>
          </Link>

          <div className="mt-10">
            <Outlet />
          </div>
        </div>
      </div>

      <div className="hidden md:block md:w-1/3 lg:w-3/5">
        <LoginShowcase />
      </div>
    </div>
  );
}
