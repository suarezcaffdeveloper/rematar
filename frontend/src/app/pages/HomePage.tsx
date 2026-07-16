import { useAuth } from '../../features/auth/hooks';
import { Card } from '../../shared/components/Card';

/**
 * Placeholder deliberado -- Épica 4, Módulo 4.1 construye la fundación (routing,
 * layouts, auth), no pantallas de producto. El Dashboard real (listado de remates,
 * accesos según rol) es un módulo futuro; esto solo prueba que login -> guard ->
 * layout autenticado -> página funciona de punta a punta.
 */
export function HomePage() {
  const { user } = useAuth();

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">
        Bienvenido{user ? `, ${user.full_name}` : ''}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Tu rol es <span className="font-medium">{user?.role}</span>. Esta es una página
        de inicio temporal -- el dashboard real es un módulo futuro (ver
        docs/24-fundacion-frontend.md).
      </p>
    </Card>
  );
}
