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
 * `isFocusMode` (Épica 9 -- "Modo Remate" de la Consola Operativa del rematador): un
 * escalón más allá de `isWide` -- oculta el `Header` por completo (la verdadera "barra
 * superior": breadcrumb + notificaciones) para que durante un remate en vivo no quede
 * ningún navbar compitiendo con la consola. El `Sidebar` ya NO se oculta acá (rediseño
 * "Modo Remate" sobre la captura de Stitch): pasó a ser un riel compacto (`w-16`,
 * `lg:pl-16` reservado) que se expande al hover sin superponerse de forma molesta, así
 * que se deja siempre visible, incluida la Consola -- el rematador conserva acceso a
 * "Cerrar sesión" y al resto de la navegación sin que la consola se sienta invadida por
 * un sidebar ancho fijo. La página que activa este modo (vía `useFocusMode`) sigue
 * ofreciendo su propia salida rápida (ver el botón "Salir" en `ConsolaHeader`).
 *
 * Accesibilidad (Épica 9, Etapa 7 -- rediseño, accesibilidad final): link de "saltar al
 * contenido" (primer elemento enfocable de la página, invisible hasta recibir foco por
 * teclado) y foco movido a `<main>` en cada cambio de ruta -- una SPA nunca recarga la
 * página, así que sin esto un usuario de lector de pantalla no se entera de que
 * navegó. No se enfoca en el primer render (dejaría el foco inicial del navegador donde
 * ya está, normalmente el `<body>`), solo en navegaciones posteriores. Se mantiene igual
 * en modo foco -- ocultar la navegación global no es motivo para bajar el estándar de
 * accesibilidad del contenido que queda.
 */
export function AppLayout() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isWide = useLayoutPreferencesStore((state) => state.isWide);
  const isFocusMode = useLayoutPreferencesStore((state) => state.isFocusMode);
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
      <div className="flex min-h-screen flex-col lg:pl-16">
        {!isFocusMode && <Header onOpenSidebar={() => setIsSidebarOpen(true)} />}
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className={clsx(
            'mx-auto w-full flex-1 focus:outline-none',
            isFocusMode
              ? 'max-w-[110rem] px-3 py-4 sm:px-4 lg:px-6'
              : clsx('px-4 py-8', isWide ? 'max-w-[90rem]' : 'max-w-5xl'),
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
