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
import { ConsolaOperativaPage } from '../features/rematador/pages/ConsolaOperativaPage';
import { LotesManagementPage } from '../features/rematador/pages/LotesManagementPage';
import { RemateAuditLogPage } from '../features/rematador/pages/RemateAuditLogPage';
import { LoteHistoryDetailPage } from '../features/history/pages/LoteHistoryDetailPage';
import { RemateHistoryDetailPage } from '../features/history/pages/RemateHistoryDetailPage';
import { RemateHistoryListPage } from '../features/history/pages/RemateHistoryListPage';
import { MiCompraDetailPage } from '../features/postauction/pages/MiCompraDetailPage';
import { MisComprasPage } from '../features/postauction/pages/MisComprasPage';
import { VentaAdjudicadaDetailPage } from '../features/postauction/pages/VentaAdjudicadaDetailPage';
import { VentasAdjudicadasPage } from '../features/postauction/pages/VentasAdjudicadasPage';
import { SalaPage } from '../features/sala/pages/SalaPage';
import { HomePage } from './pages/HomePage';
import { PreviewSalaPage } from './pages/PreviewSalaPage';
import { AdminAuditLogPage } from './pages/AdminAuditLogPage';
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
          { path: '/preview-sala', element: <PreviewSalaPage /> },
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
              // Sala del remate (Épica 4.5) -- versión inicial, solo Snapshot Service,
              // sin WebSockets todavía (ver docs/27-sala-del-remate.md). Destino de
              // "Entrar al remate" en RemateDetailPage.
              { path: '/remates/:remateId/sala', element: <SalaPage /> },
              // "Administrar remate" del Dashboard del Rematador (Épica 5.1) -- desde la
              // Épica 5.2 apunta a la Consola Operativa real (ver
              // docs/30-consola-operativa-rematador.md), reemplazando al placeholder de
              // la 5.1 sin tocar esta ruta, mismo patrón que /sala tuvo entre los
              // Módulos 4.4 y 4.5. Sin `RequireRole`: mismo criterio que el resto de las
              // rutas de `/remates/:remateId/*`, el backend decide qué puede hacer cada
              // usuario, no esta ruta.
              { path: '/remates/:remateId/gestionar', element: <ConsolaOperativaPage /> },
              // Gestión de Remates y Lotes (Épica 5.3) -- donde el rematador prepara un
              // remate (editar, publicar, cancelar, eliminar, duplicar) y sus lotes
              // (crear/editar/eliminar/duplicar/reordenar) antes de que empiece. Mismo
              // criterio sin `RequireRole` que el resto de `/remates/:remateId/*`.
              { path: '/remates/:remateId/lotes', element: <LotesManagementPage /> },
              // Auditoría de un remate puntual (Épica 7, Módulo 7.2) -- mismo criterio
              // sin RequireRole que el resto de `/remates/:remateId/*`, el backend
              // decide (dueño del remate o admin, ver AuditService.list_for_remate).
              { path: '/remates/:remateId/auditoria', element: <RemateAuditLogPage /> },
              // Historial y resultados de remates (Épica 7, Módulo 7.3) -- mismo
              // criterio sin RequireRole que el resto de `/remates/:remateId/*`: el
              // backend decide (dueño del remate o admin, exige además que el remate
              // esté finalizado/cancelado, ver HistoryService).
              { path: '/historial', element: <RemateHistoryListPage /> },
              { path: '/remates/:remateId/historial', element: <RemateHistoryDetailPage /> },
              {
                path: '/remates/:remateId/historial/lotes/:loteId',
                element: <LoteHistoryDetailPage />,
              },
              // Gestión Post-Remate (Épica 7, Módulo 7.5) -- mismo criterio sin
              // RequireRole que /historial: el backend decide (rematador dueño del
              // caso o admin para "ventas adjudicadas"; comprador dueño para "mis
              // compras"), ver docs/41-gestion-post-remate.md.
              { path: '/ventas-adjudicadas', element: <VentasAdjudicadasPage /> },
              { path: '/ventas-adjudicadas/:caseId', element: <VentaAdjudicadaDetailPage /> },
              { path: '/mis-compras', element: <MisComprasPage /> },
              { path: '/mis-compras/:caseId', element: <MiCompraDetailPage /> },
              // Protegidas además por rol: RequireRole asume que ya pasó RequireAuth.
              {
                element: <RequireRole allowedRoles={['admin']} />,
                children: [{ path: '/admin', element: <AdminAuditLogPage /> }],
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
