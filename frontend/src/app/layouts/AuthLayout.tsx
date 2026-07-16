import { Outlet } from 'react-router-dom';

/**
 * Layout para pantallas de autenticación (`/login`, `/register`) -- tarjeta
 * centrada, sin navegación ni datos de sesión (todavía no hay sesión en estas
 * pantallas por definición).
 */
export function AuthLayout() {
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
