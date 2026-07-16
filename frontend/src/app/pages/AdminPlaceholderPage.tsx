import { Card } from '../../shared/components/Card';

/**
 * Existe únicamente para demostrar `RequireRole` de punta a punta (ver
 * `app/router.tsx`) -- no es una pantalla de administración real.
 */
export function AdminPlaceholderPage() {
  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">Solo administradores</h1>
      <p className="mt-2 text-sm text-slate-600">
        Si estás viendo esto, `RequireRole` te dejó pasar porque tu rol es{' '}
        <code className="rounded bg-slate-100 px-1">admin</code>.
      </p>
    </Card>
  );
}
