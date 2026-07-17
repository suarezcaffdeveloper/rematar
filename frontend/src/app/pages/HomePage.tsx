import { useAuth } from '../../features/auth/hooks';
import { CompradorDashboardPage } from '../../features/remates/pages/CompradorDashboardPage';
import { Card } from '../../shared/components/Card';

/**
 * Punto de entrada tras el login (ruta `index` de `AppLayout`, ver `app/router.tsx`).
 * Por rol: `comprador` ya tiene su dashboard real (Épica 4, Módulo 4.3); `rematador` y
 * `admin` siguen viendo el placeholder de la Módulo 4.1 hasta que tengan el suyo propio
 * (fuera de alcance de este módulo, ver docs/25-dashboard-comprador.md).
 */
export function HomePage() {
  const { user } = useAuth();

  if (user?.role === 'comprador') {
    return <CompradorDashboardPage />;
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
