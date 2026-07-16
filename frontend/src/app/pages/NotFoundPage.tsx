import { Link } from 'react-router-dom';
import { Button } from '../../shared/components/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold text-slate-900">404</h1>
      <p className="max-w-md text-sm text-slate-600">
        La página que buscás no existe.
      </p>
      <Link to="/">
        <Button variant="secondary">Volver al inicio</Button>
      </Link>
    </div>
  );
}
