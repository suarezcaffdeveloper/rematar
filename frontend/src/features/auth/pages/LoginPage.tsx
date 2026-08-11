import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gavel } from 'lucide-react';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Alert } from '../../../shared/components/Alert';
import { useToastStore } from '../../../shared/toast/toastStore';
import { LoginShowcase } from '../components/LoginShowcase';

interface LocationState {
  from?: { pathname: string };
}

/**
 * Pantalla de login (rediseño visual -- ver conversación de diseño): dos columnas a
 * pantalla completa en vez de la tarjeta centrada genérica que comparten el resto de
 * las pantallas de auth (`/register` la sigue usando, ver `AuthLayout`). La lógica de
 * autenticación es exactamente la misma que antes (`useAuthActions().login`,
 * `normalizeApiError`, redirect a `state.from` o `/`) -- sólo cambió el marcado
 * alrededor.
 *
 * "¿Olvidaste tu contraseña?" no navega a ningún lado: no existe (todavía) un flujo de
 * recuperación de contraseña en el backend, así que en vez de un link roto o inventar
 * una ruta nueva, avisa por el sistema de toasts ya existente (`shared/toast`).
 */
export function LoginPage() {
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    useToastStore.getState().push('info', 'La recuperación de contraseña estará disponible próximamente.');
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative flex w-full flex-col justify-center overflow-hidden bg-white px-6 py-12 sm:px-12 md:w-2/3 lg:w-2/5 lg:px-16 xl:px-20">
        <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-brand-50 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto w-full max-w-sm"
        >
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Gavel className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold tracking-tight text-brand-700">RematAR</span>
          </Link>

          <h1 className="mt-10 text-3xl font-bold tracking-tight text-slate-900">
            Bienvenido a RematAR
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            Plataforma profesional para la gestión y participación en remates en tiempo
            real.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5" noValidate>
            {error && <Alert variant="error">{error}</Alert>}
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              className="py-2.5"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div>
              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                required
                className="py-2.5"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={handleForgotPassword}
                className="mt-2 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full py-2.5 text-base">
              Entrar
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            ¿No tenés cuenta?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              Registrate
            </Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden md:block md:w-1/3 lg:w-3/5">
        <LoginShowcase />
      </div>
    </div>
  );
}
