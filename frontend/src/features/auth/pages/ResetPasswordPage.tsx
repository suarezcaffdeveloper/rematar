import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Link2Off, Loader2, Lock } from 'lucide-react';
import { resetPasswordRequest, validateResetPasswordTokenRequest } from '../api';
import { normalizeApiError } from '../../../shared/api/errors';
import { STOCK_PHOTOS } from '../../../shared/media/stockPhotos';
import { useToastStore } from '../../../shared/toast/toastStore';
import { CinematicShell } from '../components/cinematic/CinematicShell';
import { GlassAlert, GlassField, GlassSubmitButton } from '../components/cinematic/GlassField';
import { PasswordRules } from '../components/cinematic/PasswordRules';
import { RecoverySteps } from '../components/cinematic/RecoverySteps';

type TokenStatus = 'checking' | 'valid' | 'invalid';

/**
 * Pantalla de destino del link de recuperación (`/reset-password?token=...`). Valida el
 * token apenas se monta (`POST /auth/reset-password/validate`) para avisar de entrada
 * si el link ya expiró o se usó, en vez de que el usuario se entere recién al enviar el
 * formulario -- decisión tomada junto con el backend al diseñar este flujo.
 *
 * Mismo marco "cinematográfico" que `LoginPage`/`RegisterPage`/`ForgotPasswordPage` (ver
 * `components/cinematic/CinematicShell`), con una foto fija y los tres pasos del flujo a la
 * izquierda: acá ya van dos hechos y el tercero en curso. Los tres estados del token
 * (validando, vencido, válido) comparten el mismo panel de vidrio.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('checking');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;

  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      return;
    }

    let isMounted = true;
    validateResetPasswordTokenRequest({ token })
      .then(() => {
        if (isMounted) setTokenStatus('valid');
      })
      .catch(() => {
        if (isMounted) setTokenStatus('invalid');
      });
    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPasswordRequest({
        token,
        new_password: newPassword,
        confirm_new_password: confirmNewPassword,
      });
      useToastStore
        .getState()
        .push('success', 'Tu contraseña fue actualizada. Iniciá sesión con la contraseña nueva.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <CinematicShell
      size="login"
      photo={STOCK_PHOTOS.maquinariaAgricola}
      photoKey="reset-password"
      zoomSeconds={30}
      headerAction={
        <p className="text-sm text-white/70">
          ¿Ya la recordaste?{' '}
          <Link to="/login" className="font-semibold text-white underline-offset-4 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      }
      aside={
        <>
          <h2 className="max-w-2xl text-6xl font-semibold leading-[1.02] tracking-[-0.035em] xl:text-7xl">
            Un último paso y volvés a entrar.
          </h2>
          {/* Con el link vencido el recorrido se corta en el paso 2: hay que pedir otro. */}
          <RecoverySteps current={tokenStatus === 'invalid' ? 1 : 2} />
        </>
      }
    >
      {tokenStatus === 'checking' && (
        <div className="flex flex-col items-center gap-4 py-8 text-center" role="status">
          <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-white/80" />
          <p className="text-[15px] text-white/70">Validando el link de recuperación…</p>
        </div>
      )}

      {tokenStatus === 'invalid' && (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Link2Off aria-hidden="true" className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-[1.75rem] font-semibold tracking-tight">Este link ya no sirve</h1>
          <div className="mt-4">
            <GlassAlert variant="error">
              Este link de recuperación ya no es válido: puede haber expirado, haberse usado,
              o haberse pedido uno más nuevo.
            </GlassAlert>
          </div>
          <Link
            to="/forgot-password"
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-ink transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          >
            Pedir un link nuevo
          </Link>
        </>
      )}

      {tokenStatus === 'valid' && (
        <>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Elegí una contraseña nueva</h1>
          <p className="mt-2 text-[15px] text-white/65">Usá una que no hayas usado en otros sitios.</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4" noValidate>
            {error && <GlassAlert variant="error">{error}</GlassAlert>}
            <GlassField
              label="Contraseña nueva"
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              required
              icon={Lock}
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
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
            <GlassField
              label="Confirmar contraseña nueva"
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              required
              icon={Lock}
              placeholder="Repetí tu contraseña nueva"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              error={passwordsMismatch ? 'Las contraseñas no coinciden.' : undefined}
              rightElement={
                !passwordsMismatch && confirmNewPassword.length > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success-400" />
                ) : undefined
              }
            />

            <PasswordRules password={newPassword} />

            <div className="mt-1">
              <GlassSubmitButton isLoading={isSubmitting}>Actualizar contraseña</GlassSubmitButton>
            </div>
          </form>

          <p className="mt-7 text-center text-sm">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Volver a iniciar sesión
            </Link>
          </p>
        </>
      )}
    </CinematicShell>
  );
}
