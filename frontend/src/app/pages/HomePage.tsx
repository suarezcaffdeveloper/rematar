import { useAuth } from '../../features/auth/hooks';
import { CompradorDashboardPage } from '../../features/remates/pages/CompradorDashboardPage';
import { RematadorDashboardPage } from '../../features/rematador/pages/RematadorDashboardPage';
import { Card } from '../../shared/components/Card';

/**
 * Punto de entrada tras el login (ruta `index` de `AppLayout`, ver `app/router.tsx`).
 * Por rol: `comprador` tiene su dashboard real desde la Épica 4.3; `rematador` desde
 * esta Épica 5.1 (Dashboard del Rematador, ver docs/29-dashboard-rematador.md); `admin`
 * sigue viendo el placeholder de la Módulo 4.1 (fuera de alcance de este módulo).
 */
export function HomePage() {
  const { user } = useAuth();

  if (user?.role === 'comprador') {
    return <CompradorDashboardPage />;
  }

  if (user?.role === 'rematador') {
    return <RematadorDashboardPage />;
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">
        Bienvenido{user ? `, ${user.full_name}` : ''}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Tu rol es <span className="font-medium">{user?.role}</span>. Esta es una página
        de inicio temporal -- tu dashboard real es un módulo futuro (ver
        docs/25-dashboard-comprador.md).
      </p>
    </Card>
  );
}
