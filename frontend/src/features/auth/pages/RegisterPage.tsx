import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff, Gavel, Lock, Mail, Phone, User } from 'lucide-react';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Alert } from '../../../shared/components/Alert';
import type { RegisterableRole } from '../types';
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter';
import { RegisterShowcase } from '../components/RegisterShowcase';

const ROLE_OPTIONS: { value: RegisterableRole; label: string; description: string; icon: typeof User }[] = [
  { value: 'comprador', label: 'Comprador', description: 'Quiero ofertar en remates', icon: User },
  { value: 'rematador', label: 'Rematador', description: 'Quiero organizar remates', icon: Gavel },
];

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
// Mismo criterio que el backend (`PHONE_PATTERN` en
// `backend/app/modules/users/schemas.py`): formato tipo E.164, dígitos con `+` opcional
// al inicio, sin contar espacios/guiones/paréntesis que el usuario pueda tipear.
const PHONE_PATTERN = /^\+?\d{8,15}$/;

/**
 * Pantalla de registro (mismo rediseño premium que `LoginPage.tsx`): dos columnas a
 * pantalla completa en vez de la tarjeta centrada genérica (ver el fallback que
 * sigue usando `AuthLayout` para cualquier otra pantalla de auth). Campos: nombre
 * completo, email, teléfono, contraseña y confirmar contraseña -- éste último es
 * puramente de validación (compara contra `password` acá y de nuevo en el backend
 * como defensa en profundidad, ver `UserCreate` en
 * `backend/app/modules/users/schemas.py`) y nunca se persiste en ningún lado, aunque sí
 * viaja en el POST de registro para que el backend pueda revalidarlo.
 *
 * La imagen ocupa toda la altura (sin la sección de beneficios que tenía antes, ya
 * retirada) y, desde `lg:`, la tarjeta del formulario se desplaza un 20% de su propio
 * ancho (`lg:translate-x-[20%]`, un porcentaje de `transform` se calcula sobre el
 * tamaño del propio elemento, no el del contenedor) para superponerse sobre el borde
 * de la imagen. `relative z-10` en la tarjeta es lo que la deja pintándose por
 * encima de la columna de la imagen a pesar de venir antes en el DOM -- un elemento
 * posicionado con z-index le gana a un hermano estático sin importar el orden.
 *
 * Pantalla fija, sin scroll de página (`h-screen overflow-hidden` en la raíz en vez
 * de `min-h-screen`): el espaciado de la tarjeta se compactó a propósito para que
 * entre completa en la altura disponible. `max-h-full overflow-y-auto` en la tarjeta
 * es sólo un resguardo -- si en una pantalla muy baja el contenido no entrara igual,
 * scrollea la tarjeta en sí (nunca la página) en vez de recortarlo en silencio.
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
      await register({
        full_name: fullName,
        email,
        phone,
        password,
        confirm_password: confirmPassword,
        role,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <div className="relative flex w-full flex-col items-center justify-center px-6 py-6 sm:px-12 md:w-1/2 md:px-8 md:py-4 lg:w-[36%] lg:items-end lg:px-0">
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand-50 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-h-full w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 sm:p-8 lg:translate-x-[20%] lg:p-8"
        >
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Gavel className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold tracking-tight text-brand-700">RematAR</span>
          </Link>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Crear una cuenta</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Unite a la plataforma de remates en tiempo real y comenzá a participar de
            subastas de forma simple y segura.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3" noValidate>
            {error && <Alert variant="error">{error}</Alert>}

            <Input
              label="Nombre completo"
              autoComplete="name"
              required
              icon={User}
              className="py-2"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              rightElement={
                isFullNameValid ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : undefined
              }
            />

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              icon={Mail}
              className="py-2"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              rightElement={isEmailValid ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : undefined}
            />

            <Input
              label="Teléfono"
              type="tel"
              autoComplete="tel"
              required
              icon={Phone}
              className="py-2"
              placeholder="+54 9 11 2345-6789"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              rightElement={isPhoneValid ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : undefined}
            />

            <div>
              <Input
                label="Contraseña"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                required
                icon={Lock}
                className="py-2"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                    className="text-slate-400 transition-colors hover:text-slate-600"
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
              className="py-2"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={passwordsMismatch ? 'Las contraseñas no coinciden.' : undefined}
              rightElement={
                !passwordsMismatch && confirmPassword.length > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success-500" />
                ) : undefined
              }
            />

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium text-slate-700">Quiero registrarme como</legend>
              <div className="grid grid-cols-2 gap-3">
                {ROLE_OPTIONS.map((option) => {
                  const isSelected = role === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-2.5 transition-all duration-200 ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
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
                      <option.icon
                        aria-hidden="true"
                        className={`h-4 w-4 ${isSelected ? 'text-brand-600' : 'text-slate-400'}`}
                      />
                      <span className={`text-sm font-semibold ${isSelected ? 'text-brand-700' : 'text-slate-700'}`}>
                        {option.label}
                      </span>
                      <span className="text-xs text-slate-500">{option.description}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Button type="submit" isLoading={isSubmitting} className="w-full py-2 text-base">
              Crear cuenta
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            ¿Ya tenés una cuenta?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden md:block md:w-1/2 lg:w-[64%]">
        <RegisterShowcase />
      </div>
    </div>
  );
}
