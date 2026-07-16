import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Alert } from '../../../shared/components/Alert';
import { Card } from '../../../shared/components/Card';
import type { RegisterableRole } from '../types';

const ROLE_OPTIONS: { value: RegisterableRole; label: string }[] = [
  { value: 'comprador', label: 'Comprador' },
  { value: 'rematador', label: 'Rematador' },
];

export function RegisterPage() {
  const { register } = useAuthActions();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RegisterableRole>('comprador');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({ full_name: fullName, email, password, role });
      navigate('/', { replace: true });
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Crear cuenta</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Nombre completo"
          autoComplete="name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">Quiero registrarme como</legend>
          <div className="flex gap-4">
            {ROLE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Crear cuenta
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </Card>
  );
}
