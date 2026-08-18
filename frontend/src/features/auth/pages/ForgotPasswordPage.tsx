import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { forgotPasswordRequest } from '../api';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Alert } from '../../../shared/components/Alert';

/**
 * "¿Olvidaste tu contraseña?" (RNF-11). Sin `AuthLayout` de dos columnas (a diferencia
 * de `/login`/`/register`): esta pantalla usa el fallback centrado que `AuthLayout` ya
 * tenía preparado para "otra pantalla de auth simple" -- no está en `FULL_BLEED_PATHS`.
 *
 * El backend siempre responde 204 exista o no el email (para no filtrar qué cuentas
 * están registradas), así que el estado de éxito es el mismo mensaje sin importar la
 * respuesta real -- nunca se le muestra al usuario si el email existía o no.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPasswordRequest({ email });
      setIsSent(true);
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSent) {
    return (
      <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
        <Alert variant="success">
          Si existe una cuenta con ese email, te enviamos un link para restablecer tu
          contraseña. Revisá tu bandeja de entrada (y la carpeta de spam).
        </Alert>
        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-ink">Recuperar contraseña</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Ingresá el email de tu cuenta y te vamos a enviar un link para elegir una
        contraseña nueva.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          icon={Mail}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Enviar link de recuperación
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
