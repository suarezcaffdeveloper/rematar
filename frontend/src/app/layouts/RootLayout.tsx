import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ToastViewport } from '../../shared/toast/ToastViewport';
import { Button } from '../../shared/components/Button';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Red de seguridad para errores de render que ningún `try/catch` de un `async`
 * atraparía (un componente que explota al dibujarse). Las llamadas HTTP tienen su
 * propio manejo centralizado (`shared/api/errors.ts` + toasts) -- esto es solo para lo
 * que ni siquiera llega a esa capa.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en el árbol de React:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Algo salió mal</h1>
          <p className="max-w-md text-sm text-slate-600">
            Ocurrió un error inesperado en la aplicación. Podés intentar recargar la
            página.
          </p>
          <Button onClick={() => window.location.reload()}>Recargar</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Sube el scroll de la ventana al tope en cada cambio de ruta. Una SPA nunca recarga la
 * página, así que el navegador no hace lo que sí hace solo en una navegación clásica --
 * sin esto, una pantalla nueva puede arrancar con el scroll donde había quedado la
 * anterior (ej. al pie de una lista larga), tapando su propio título. Se engancha acá,
 * en `RootLayout` (el único wrapper de TODAS las rutas), en vez de en `AppLayout`, para
 * que también cubra `/login` y `/register` -- y para no repetir la lógica por pantalla.
 * Clave en `pathname` solamente (no en `search`/`hash`): cambiar de página dentro de la
 * misma ruta (paginación, filtros) ya maneja su propio scroll cuando lo necesita (ver
 * `CompradorDashboardPage.handlePageChange`), y esto no debe pisarlo. Toca únicamente el
 * scroll del documento -- nunca el de un contenedor propio (modal, tabla, carrusel), que
 * vive en su propio elemento con overflow y no se ve afectado por `window.scrollTo`.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

/**
 * Layout principal: el único que envuelve TODAS las rutas, sin excepción (auth y
 * aplicación incluidas) -- ver `app/router.tsx`. Monta lo que de verdad es global:
 * el error boundary y el visor de toasts. Nunca dibuja navegación ni nada específico
 * de una sección; eso vive en `AuthLayout`/`AppLayout`.
 */
export function RootLayout() {
  return (
    <RootErrorBoundary>
      <ScrollToTop />
      <ToastViewport />
      <Outlet />
    </RootErrorBoundary>
  );
}
