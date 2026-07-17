/**
 * Árbol de rutas (Épica 4, Módulo 4.1). Ver docs/24-fundacion-frontend.md, "Manejo de
 * rutas", para la explicación completa de por qué está anidado así.
 *
 * `createBrowserRouter` (API de datos de React Router v7), no `<BrowserRouter>` +
 * `<Routes>`: es la API recomendada actualmente y deja preparado el terreno para
 * `loader`/`action` por ruta el día que una pantalla necesite cargar datos antes de
 * renderizar -- no hace falta migrar nada, solo agregar esos campos a la ruta que los
 * necesite.
 */

import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth } from '../shared/guards/RequireAuth';
import { RequireRole } from '../shared/guards/RequireRole';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { RemateDetailPage } from '../features/remates/pages/RemateDetailPage';
import { SalaPlaceholderPage } from '../features/remates/pages/SalaPlaceholderPage';
import { HomePage } from './pages/HomePage';
import { AdminPlaceholderPage } from './pages/AdminPlaceholderPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Públicas, sin sesión.
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      // Protegidas: todo lo que cuelga de acá exige sesión iniciada.
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              // Detalle del remate (Épica 4.4) -- cualquier rol autenticado puede
              // navegar acá; el backend decide qué remate es visible para quién
              // (RemateService.get_visible_or_raise), no esta ruta.
              { path: '/remates/:remateId', element: <RemateDetailPage /> },
              // Placeholder de la sala en vivo (WebSocket/ofertas/chat/video, módulo
              // futuro) -- destino de "Entrar al remate" en RemateDetailPage.
              { path: '/remates/:remateId/sala', element: <SalaPlaceholderPage /> },
              // Protegidas además por rol: RequireRole asume que ya pasó RequireAuth.
              {
                element: <RequireRole allowedRoles={['admin']} />,
                children: [{ path: '/admin', element: <AdminPlaceholderPage /> }],
              },
            ],
          },
        ],
      },
      { path: '/403', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
