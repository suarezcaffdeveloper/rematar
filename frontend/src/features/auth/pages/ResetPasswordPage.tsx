import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { resetPasswordRequest, validateResetPasswordTokenRequest } from '../api';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Spinner } from '../../../shared/components/Spinner';
import { useToastStore } from '../../../shared/toast/toastStore';
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter';

type TokenStatus = 'checking' | 'valid' | 'invalid';

/**
 * Pantalla de destino del link de recuperación (`/reset-password?token=...`). Valida el
 * token apenas se monta (`POST /auth/reset-password/validate`) para avisar de entrada
 * si el link ya expiró o se usó, en vez de que el usuario se entere recién al enviar el
 * formulario -- decisión tomada junto con el backend al diseñar este flujo.
 *
 * Mismo fallback centrado de `AuthLayout` que `ForgotPasswordPage` (no está en
 * `FULL_BLEED_PATHS`).
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

  if (tokenStatus === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white p-6 shadow-sm">
        <Spinner size="md" />
        <p className="text-sm text-ink-muted">Validando el link de recuperación…</p>
      </div>
    );
  }

  if (tokenStatus === 'invalid') {
    return (
      <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
        <Alert variant="error">
          Este link de recuperación ya no es válido: puede haber expirado, haberse usado,
          o haberse pedido uno más nuevo.
        </Alert>
        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link to="/forgot-password" className="font-semibold text-brand-600 hover:underline">
            Pedir un link nuevo
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-ink">Elegí una contraseña nueva</h1>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        <div>
          <Input
            label="Contraseña nueva"
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            icon={Lock}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            rightElement={
              <button
                type="button"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                className="text-ink-faint transition-colors hover:text-ink-muted"
                aria-label={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <PasswordStrengthMeter password={newPassword} />
        </div>

        <Input
          label="Confirmar contraseña nueva"
          type={isPasswordVisible ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
          icon={Lock}
          value={confirmNewPassword}
          onChange={(event) => setConfirmNewPassword(event.target.value)}
          error={passwordsMismatch ? 'Las contraseñas no coinciden.' : undefined}
          rightElement={
            !passwordsMismatch && confirmNewPassword.length > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-success-500" />
            ) : undefined
          }
        />

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Actualizar contraseña
        </Button>
      </form>
    </div>
  );
}
