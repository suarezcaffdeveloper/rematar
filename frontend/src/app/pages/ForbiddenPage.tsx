import { Link } from 'react-router-dom';
import { Button } from '../../shared/components/Button';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold text-slate-900">403</h1>
      <p className="max-w-md text-sm text-slate-600">
        Tu cuenta no tiene permiso para ver esta página.
      </p>
      <Link to="/">
        <Button variant="secondary">Volver al inicio</Button>
      </Link>
    </div>
  );
}
