import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../features/auth/hooks';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

/**
 * Layout para la aplicación autenticada -- `<Outlet />` para el contenido de cada
 * pantalla. Vive DENTRO de `RequireAuth` (ver `app/router.tsx`), así que `user` siempre
 * existe acá.
 *
 * Rediseño de navegación (Épica 9, Etapa 2): reemplaza el único header que existía
 * antes (logo + link admin + nombre/rol + logout, sin sidebar) por `Sidebar` (nav por
 * rol, persistente en desktop desde `lg:`, drawer con overlay en mobile/tablet) +
 * `Header` (breadcrumb de la pantalla actual + acciones de usuario). El estado de
 * apertura del drawer mobile vive acá porque lo necesitan los dos: el botón que lo abre
 * está en `Header`, el panel que se abre es `Sidebar`.
 *
 * `isWide` (Épica 9, Etapa 4): páginas tipo "sala de operación" (Sala del Remate) piden
 * un `<main>` más ancho vía `useWideLayout` -- el resto de las pantallas se queda con el
 * `max-w-5xl` de siempre.
 *
 * Accesibilidad (Épica 9, Etapa 7 -- rediseño, accesibilidad final): link de "saltar al
 * contenido" (primer elemento enfocable de la página, invisible hasta recibir foco por
 * teclado) y foco movido a `<main>` en cada cambio de ruta -- una SPA nunca recarga la
 * página, así que sin esto un usuario de lector de pantalla no se entera de que
 * navegó. No se enfoca en el primer render (dejaría el foco inicial del navegador donde
 * ya está, normalmente el `<body>`), solo en navegaciones posteriores.
 */
export function AppLayout() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isWide = useLayoutPreferencesStore((state) => state.isWide);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-brand-700 focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Saltar al contenido principal
      </a>
      <Sidebar role={user?.role} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header onOpenSidebar={() => setIsSidebarOpen(true)} />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className={clsx(
            'mx-auto w-full flex-1 px-4 py-8 focus:outline-none',
            isWide ? 'max-w-[90rem]' : 'max-w-5xl',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
