import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks';
import { CompradorDashboardPage } from '../../features/remates/pages/CompradorDashboardPage';
import { RematadorDashboardPage } from '../../features/rematador/pages/RematadorDashboardPage';
import { OperatorClaimPage } from '../../features/rematador/pages/OperatorClaimPage';
import { Button } from '../../shared/components/Button';
import { Card } from '../../shared/components/Card';

/**
 * Punto de entrada tras el login (ruta `index` de `AppLayout`, ver `app/router.tsx`).
 * Por rol: `comprador` tiene su dashboard real desde la Épica 4.3; `empresa` (dueña de
 * remates desde ADR-047, antes era `rematador`) tiene el mismo dashboard construido en
 * la Épica 5.1 (ver docs/29-dashboard-rematador.md); `rematador` (acotado a operar en
 * vivo desde ADR-047/ADR-048, nunca dueño de un remate) arranca en `OperatorClaimPage`
 * -- no tiene "sus remates" para listar, solo el canje de un código de operador; `admin`
 * no tiene un dashboard propio (fuera de alcance) pero sí un destino real, `/admin`
 * (Auditoría/Historial/Monitoreo, Épicas 7-8) -- antes esta pantalla no ofrecía ningún
 * link hacia ahí y remitía a un doc del comprador por error (Épica 8, Módulo 8.0,
 * revisión funcional).
 */
export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role === 'comprador') {
    return <CompradorDashboardPage />;
  }

  if (user?.role === 'empresa') {
    return <RematadorDashboardPage />;
  }

  if (user?.role === 'rematador') {
    return <OperatorClaimPage />;
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Bienvenido{user ? `, ${user.full_name}` : ''}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Tu rol es <span className="font-medium">{user?.role}</span>. Desde el panel de
        administrador podés ver la auditoría, el historial de remates y el monitoreo de
        la plataforma.
      </p>
      <Button className="mt-4" onClick={() => navigate('/admin')}>
        Ir al panel de administrador
      </Button>
    </Card>
  );
}
