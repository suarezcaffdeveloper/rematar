import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { AUTH_RUBROS } from '../components/cinematic/authRubros';
import { CategoryCarousel } from '../components/cinematic/CategoryCarousel';
import { CinematicShell } from '../components/cinematic/CinematicShell';
import { GlassAlert, GlassField, GlassSubmitButton } from '../components/cinematic/GlassField';
import { useAutoRotate } from '../components/cinematic/useAutoRotate';

/** Cuánto está cada rubro en pantalla antes de pasar al siguiente. */
const ROTATE_MS = 8000;

/**
 * Pantalla de login (rediseño "cinematográfico", mismo marco que `RegisterPage` -- ver
 * `components/cinematic/CinematicShell`): fotografía a pantalla completa con el carrusel de
 * rubros a la izquierda y el formulario en un panel de vidrio. La lógica de autenticación es
 * exactamente la de antes (`useAuthActions().login`, `normalizeApiError`) -- sólo cambió el
 * marcado alrededor.
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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [rubroIndex, setRubroIndex] = useAutoRotate(AUTH_RUBROS.length, ROTATE_MS, isCarouselPaused);
  const rubro = AUTH_RUBROS[rubroIndex];

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
    <CinematicShell
      size="login"
      photo={rubro.photo}
      photoKey={rubro.category}
      zoomSeconds={ROTATE_MS / 1000 + 2}
      headerAction={
        // Visitante anónimo (ADR-049): el listado, el detalle de un remate y su sala
        // en vivo ya aceptan un viewer sin sesión -- este link es el único punto de
        // entrada explícito a esa vista (ofertar y chatear siguen exigiendo login,
        // ver `PlaceBidButton`/`ChatPanel`).
        <Link
          to="/remates"
          className="rounded-full px-4 py-2 text-sm font-medium text-white/80 ring-1 ring-white/25 backdrop-blur transition hover:bg-white/10 hover:text-white"
        >
          Ver remates sin iniciar sesión
        </Link>
      }
      aside={
        <>
          <h2 className="max-w-2xl text-6xl font-semibold leading-[1.02] tracking-[-0.035em] xl:text-7xl">
            Cada lote tiene su momento.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-white/70">
            Remates en vivo y por tiempo, con ofertas que se actualizan al instante para todos los
            participantes.
          </p>
          <div className="mt-10">
            <CategoryCarousel
              items={AUTH_RUBROS}
              index={rubroIndex}
              onSelect={setRubroIndex}
              durationMs={ROTATE_MS}
              paused={isCarouselPaused}
              onPausedChange={setIsCarouselPaused}
            />
          </div>
        </>
      }
    >
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Bienvenido a RematAR</h1>
      <p className="mt-2 text-[15px] text-white/65">Entrá con tu cuenta para seguir tus ofertas.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>
        {error && <GlassAlert variant="error">{error}</GlassAlert>}
        <GlassField
          label="Email"
          type="email"
          autoComplete="email"
          required
          icon={Mail}
          placeholder="nombre@empresa.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div>
          <GlassField
            label="Contraseña"
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            required
            icon={Lock}
            placeholder="Tu contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            rightElement={
              <button
                type="button"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                className="rounded p-0.5 text-white/50 transition-colors hover:text-white"
                aria-label={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <div className="mt-2.5 text-right">
            <Link to="/forgot-password" className="text-[13px] font-medium text-brand-300 hover:text-white">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
        <GlassSubmitButton isLoading={isSubmitting}>
          Entrar
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </GlassSubmitButton>
      </form>

      <p className="mt-7 text-center text-sm text-white/65">
        ¿No tenés cuenta?{' '}
        <Link to="/register" className="font-semibold text-white underline-offset-4 hover:underline">
          Registrate
        </Link>
      </p>
    </CinematicShell>
  );
}
