import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gavel } from 'lucide-react';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Alert } from '../../../shared/components/Alert';
import { LoginShowcase } from '../components/LoginShowcase';

/**
 * Pantalla de login (rediseño visual -- ver conversación de diseño): dos columnas a
 * pantalla completa en vez de la tarjeta centrada genérica que comparten el resto de
 * las pantallas de auth (`/register` la sigue usando, ver `AuthLayout`). La lógica de
 * autenticación es exactamente la misma que antes (`useAuthActions().login`,
 * `normalizeApiError`) -- sólo cambió el marcado alrededor.
 *
 * Redirect fijo a `/` (nunca `location.state.from`): `/` es la ruta `index` de
 * `AppLayout` (`HomePage`) y ya reparte por rol (comprador/empresa/rematador/admin,
 * ver su propio docstring). Antes se volvía a `state.from` cuando `RequireAuth`
 * redirigía acá guardando la ruta que se intentaba visitar -- pero esa ruta quedaba
 * pegada a la ENTRADA del historial de `/login`, no a la sesión: si el Usuario A
 * (rematador) quedaba deslogueado estando en `/remates/:id/gestionar`, `RequireAuth`
 * fijaba `state.from` a esa ruta; si el Usuario B se logueaba después en la misma
 * pestaña, terminaba en la consola operativa de un remate ajeno con un rol que no le
 * corresponde (esa ruta no tiene `RequireRole`, el backend rechaza las acciones pero
 * ya mostró el panel equivocado). `/` siempre es correcto para cualquier rol, así que
 * ya no hace falta el caso especial.
 *
 * "¿Olvidaste tu contraseña?" navega a `/forgot-password` (RNF-11).
 */
export function LoginPage() {
  const { login } = useAuthActions();
  const navigate = useNavigate();

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
      navigate('/', { replace: true });
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
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

          <h1 className="mt-10 text-3xl font-bold tracking-tight text-ink">
            Bienvenido a RematAR
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
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
              <Link
                to="/forgot-password"
                className="mt-2 inline-block text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full py-2.5 text-base">
              Entrar
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-ink-muted">
            ¿No tenés cuenta?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              Registrate
            </Link>
          </p>

          {/* Visitante anónimo (ADR-049): el listado, el detalle de un remate y su sala
              en vivo ya aceptan un viewer sin sesión -- este link es el único punto de
              entrada explícito a esa vista (ofertar y chatear siguen exigiendo login,
              ver `PlaceBidButton`/`ChatPanel`). */}
          <p className="mt-2 text-center text-sm text-ink-muted">
            ¿Solo querés mirar?{' '}
            <Link to="/remates" className="font-semibold text-brand-600 hover:underline">
              Ver remates sin iniciar sesión
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
