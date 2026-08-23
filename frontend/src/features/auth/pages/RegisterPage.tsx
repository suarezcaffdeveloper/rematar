import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, CheckCircle2, Eye, EyeOff, Gavel, Lock, Mail, Phone, User } from 'lucide-react';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Alert } from '../../../shared/components/Alert';
import { ROLES_PENDING_APPROVAL, type RegisterableRole } from '../types';
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter';
import { RegisterShowcase } from '../components/RegisterShowcase';

const ROLE_OPTIONS: { value: RegisterableRole; label: string; description: string; icon: typeof User }[] = [
  { value: 'comprador', label: 'Comprador', description: 'Quiero ofertar en remates', icon: User },
  { value: 'empresa', label: 'Empresa', description: 'Quiero organizar remates', icon: Building2 },
  { value: 'rematador', label: 'Rematador', description: 'Quiero dirigir remates en vivo', icon: Gavel },
];

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
// Mismo criterio que el backend (`PHONE_PATTERN` en
// `backend/app/modules/users/schemas.py`): formato tipo E.164, dígitos con `+` opcional
// al inicio, sin contar espacios/guiones/paréntesis que el usuario pueda tipear.
const PHONE_PATTERN = /^\+?\d{8,15}$/;

/**
 * Pantalla de registro (mismo estilo minimalista sin card que `LoginPage.tsx`): dos
 * columnas a pantalla completa, sin tarjeta ni superposición sobre la imagen -- el
 * formulario vive directo sobre el fondo blanco de su columna, igual que el login.
 * Campos: nombre completo, email, teléfono, contraseña y confirmar contraseña --
 * éste último es puramente de validación (compara contra `password` acá y de nuevo
 * en el backend como defensa en profundidad, ver `UserCreate` en
 * `backend/app/modules/users/schemas.py`) y nunca se persiste en ningún lado, aunque
 * sí viaja en el POST de registro para que el backend pueda revalidarlo.
 *
 * Teléfono/email y contraseña/confirmar contraseña van de a pares en la misma fila
 * (`grid grid-cols-2`) para mantener el formulario compacto en altura pese a tener
 * más campos que el login.
 */
export function RegisterPage() {
  const { register } = useAuthActions();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<RegisterableRole>('comprador');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  const isFullNameValid = fullName.trim().length > 1;
  const isEmailValid = EMAIL_PATTERN.test(email);
  const isPhoneValid = PHONE_PATTERN.test(phone.replace(/[\s\-()]/g, ''));
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { pendingApproval } = await register({
        full_name: fullName,
        email,
        phone,
        password,
        confirm_password: confirmPassword,
        role,
      });
      if (pendingApproval) {
        setIsPendingApproval(true);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative flex w-full flex-col justify-center overflow-hidden bg-white px-6 py-12 sm:px-12 md:w-2/3 lg:w-1/2 lg:px-16 xl:px-20">
        <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-brand-50 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto w-full max-w-md"
        >
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Gavel className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold tracking-tight text-brand-700">RematAR</span>
          </Link>

          {isPendingApproval ? (
            <>
              <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink">Cuenta creada</h1>
              <Alert variant="success" className="mt-4">
                Tu cuenta como {role === 'empresa' ? 'empresa' : 'rematador'} quedó pendiente de
                aprobación. Un administrador de RematAR la va a revisar y activar antes de que
                puedas iniciar sesión -- te vamos a avisar por email apenas esté lista.
              </Alert>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink">Crear una cuenta</h1>
              <p className="mt-3 text-base leading-relaxed text-ink-muted">
                Unite a la plataforma de remates en tiempo real y comenzá a participar de
                subastas de forma simple y segura.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
                {error && <Alert variant="error">{error}</Alert>}

                <Input
                  label="Nombre completo"
                  autoComplete="name"
                  required
                  icon={User}
                  className="py-2.5"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  rightElement={
                    isFullNameValid ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : undefined
                  }
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Teléfono"
                    type="tel"
                    autoComplete="tel"
                    required
                    icon={Phone}
                    className="py-2.5"
                    placeholder="+54 9 11 2345-6789"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    rightElement={isPhoneValid ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : undefined}
                  />

                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    icon={Mail}
                    className="py-2.5"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    rightElement={isEmailValid ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : undefined}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="Contraseña"
                      type={isPasswordVisible ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      icon={Lock}
                      className="py-2.5"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
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
                    <PasswordStrengthMeter password={password} />
                  </div>

                  <Input
                    label="Confirmar contraseña"
                    type={isPasswordVisible ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    icon={Lock}
                    className="py-2.5"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    error={passwordsMismatch ? 'Las contraseñas no coinciden.' : undefined}
                    rightElement={
                      !passwordsMismatch && confirmPassword.length > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-success-500" />
                      ) : undefined
                    }
                  />
                </div>

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-medium text-ink">Quiero registrarme como</legend>
                  <div className="grid grid-cols-3 gap-3">
                    {ROLE_OPTIONS.map((option) => {
                      const isSelected = role === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2 transition-all duration-200 ${
                            isSelected
                              ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                              : 'border-line bg-white hover:border-brand-300 hover:bg-surface-subtle'
                          }`}
                        >
                          <input
                            type="radio"
                            name="role"
                            value={option.value}
                            checked={isSelected}
                            onChange={() => setRole(option.value)}
                            className="sr-only"
                          />
                          <span className="flex items-center gap-1.5">
                            <option.icon
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-brand-600' : 'text-ink-faint'}`}
                            />
                            <span className={`text-sm font-semibold ${isSelected ? 'text-brand-700' : 'text-ink'}`}>
                              {option.label}
                            </span>
                          </span>
                          <span className="text-xs text-ink-muted">{option.description}</span>
                        </label>
                      );
                    })}
                  </div>
                  {ROLES_PENDING_APPROVAL.has(role) && (
                    <p className="text-xs text-ink-muted">
                      Esta cuenta queda pendiente de aprobación de un administrador antes de
                      poder iniciar sesión.
                    </p>
                  )}
                </fieldset>

                <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full py-2.5 text-base">
                  Crear cuenta
                </Button>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-sm text-ink-muted">
            ¿Ya tenés una cuenta?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden md:block md:w-1/3 lg:w-1/2">
        <RegisterShowcase />
      </div>
    </div>
  );
}
