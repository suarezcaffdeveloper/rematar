import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MailCheck, Mail } from 'lucide-react';
import { forgotPasswordRequest } from '../api';
import { normalizeApiError } from '../../../shared/api/errors';
import { CategoryTicker } from '../components/cinematic/CategoryTicker';
import { AUTH_ROTATE_MS, useAuthRubros } from '../components/cinematic/useAuthRubros';
import { CinematicShell } from '../components/cinematic/CinematicShell';
import { GlassAlert, GlassField, GlassSubmitButton } from '../components/cinematic/GlassField';
import { RecoverySteps } from '../components/cinematic/RecoverySteps';

/**
 * "¿Olvidaste tu contraseña?" (RNF-11). Mismo marco "cinematográfico" que `LoginPage` y
 * `RegisterPage` (ver `components/cinematic/CinematicShell`), pero con una sola foto fija en
 * vez del carrusel de rubros: es una pantalla de paso, no de bienvenida. A la izquierda, los
 * tres pasos del flujo con el actual resaltado. `AuthLayout` la deja pasar sin su fallback
 * centrado (está en `FULL_BLEED_PATHS`).
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

  const currentStep = isSent ? 1 : 0;

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

  const {
    rubro,
    index: rubroIndex,
    setIndex: setRubroIndex,
    isPaused: isTickerPaused,
    setIsPaused: setIsTickerPaused,
  } = useAuthRubros();

  return (
    <CinematicShell
      size="login"
      photo={rubro.photo}
      photoKey={rubro.category}
      zoomSeconds={AUTH_ROTATE_MS / 1000 + 1}
      headerAction={
        <p className="text-sm text-white/70">
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="font-semibold text-white underline-offset-4 hover:underline">
            Registrate
          </Link>
        </p>
      }
      aside={
        <>
          <h2 className="max-w-2xl text-6xl font-semibold leading-[1.02] tracking-[-0.035em] xl:text-7xl">
            Recuperá el acceso a tu cuenta.
          </h2>
          <RecoverySteps current={currentStep} />
          <CategoryTicker
            index={rubroIndex}
            onSelect={setRubroIndex}
            durationMs={AUTH_ROTATE_MS}
            paused={isTickerPaused}
            onPausedChange={setIsTickerPaused}
          />
        </>
      }
    >
      {isSent ? (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <MailCheck aria-hidden="true" className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-[1.75rem] font-semibold tracking-tight">Revisá tu email</h1>
          <div className="mt-4">
            <GlassAlert variant="success">
              Si existe una cuenta con ese email, te enviamos un link para restablecer tu contraseña. Revisá
              tu bandeja de entrada (y la carpeta de spam).
            </GlassAlert>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Recuperar contraseña</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-white/65">
            Ingresá el email de tu cuenta y te vamos a enviar un link para elegir una contraseña nueva.
          </p>

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
            <GlassSubmitButton isLoading={isSubmitting}>
              Enviar link de recuperación
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </GlassSubmitButton>
          </form>
        </>
      )}

      <p className="mt-7 text-center text-sm">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-semibold text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Volver a iniciar sesión
        </Link>
      </p>
    </CinematicShell>
  );
}
