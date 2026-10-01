import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { useAuthActions } from '../hooks';
import { normalizeApiError } from '../../../shared/api/errors';
import { STOCK_PHOTOS, type StockPhoto } from '../../../shared/media/stockPhotos';
import { ROLES_PENDING_APPROVAL, type RegisterableRole } from '../types';
import { CinematicShell } from '../components/cinematic/CinematicShell';
import { GlassAlert, GlassField, GlassSubmitButton } from '../components/cinematic/GlassField';
import { PasswordRules } from '../components/cinematic/PasswordRules';

interface RoleOption {
  value: RegisterableRole;
  label: string;
  photo: StockPhoto;
  /** Titular y ventajas de la columna izquierda: cambian con el rol elegido. */
  title: string;
  points: string[];
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'comprador',
    label: 'Comprador',
    photo: STOCK_PHOTOS.vehiculos,
    title: 'Ofertá en vivo, desde donde estés.',
    points: [
      'Seguí los remates en tiempo real',
      'Ofertá con garantía económica verificada',
      'Tené todas tus compras en un solo lugar',
    ],
  },
  {
    value: 'empresa',
    label: 'Empresa',
    photo: STOCK_PHOTOS.maquinariaPesada,
    title: 'Armá tus remates y vendé a todo el país.',
    points: ['Remates en vivo y por tiempo', 'Lotes con fotos y video', 'Seguimiento de cada venta adjudicada'],
  },
  {
    value: 'rematador',
    label: 'Martillero',
    photo: STOCK_PHOTOS.ganado,
    title: 'Dirigí la sala con el control en tus manos.',
    points: [
      'Consola con ofertas y chat en tiempo real',
      'Control del ritmo lote por lote',
      'Registro de auditoría de cada acción',
    ],
  },
];

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
// Mismo criterio que el backend (`PHONE_PATTERN` en
// `backend/app/modules/users/schemas.py`): formato tipo E.164, dígitos con `+` opcional
// al inicio, sin contar espacios/guiones/paréntesis que el usuario pueda tipear.
const PHONE_PATTERN = /^\+?\d{8,15}$/;

/**
 * Pantalla de registro (rediseño "cinematográfico", mismo marco que `LoginPage.tsx` -- ver
 * `components/cinematic/CinematicShell`): foto a pantalla completa y formulario en un panel
 * de vidrio. La foto, el titular y las ventajas de la izquierda cambian según el rol elegido.
 * Campos: nombre completo, email, teléfono, contraseña y confirmar contraseña --
 * éste último es puramente de validación (compara contra `password` acá y de nuevo
 * en el backend como defensa en profundidad, ver `UserCreate` en
 * `backend/app/modules/users/schemas.py`) y nunca se persiste en ningún lado, aunque
 * sí viaja en el POST de registro para que el backend pueda revalidarlo.
 *
 * Email/teléfono y contraseña/confirmar van de a pares en la misma fila
 * (`grid sm:grid-cols-2`) para mantener el formulario compacto en altura -- apilados en
 * una sola columna por debajo de `sm` (640px), donde dos columnas dejan muy poco ancho.
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

  const currentRole = ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS[0];
  const isFullNameValid = fullName.trim().length > 1;
  const isEmailValid = EMAIL_PATTERN.test(email);
  const isPhoneValid = PHONE_PATTERN.test(phone.replace(/[\s\-()]/g, ''));
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const validMark = <CheckCircle2 className="h-4 w-4 text-success-400" />;

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
    <CinematicShell
      size="register"
      photo={currentRole.photo}
      photoKey={currentRole.value}
      headerAction={
        <p className="text-sm text-white/70">
          ¿Ya tenés una cuenta?{' '}
          <Link to="/login" className="font-semibold text-white underline-offset-4 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      }
      aside={
        <AnimatePresence mode="wait">
          <motion.div
            key={currentRole.value}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="max-w-2xl text-6xl font-semibold leading-[1.02] tracking-[-0.035em] xl:text-7xl">
              {currentRole.title}
            </h2>
            <ul className="mt-10 flex max-w-md flex-col gap-3.5">
              {currentRole.points.map((point) => (
                <li key={point} className="flex items-center gap-4 text-[17px] text-white/80">
                  <span className="h-px w-8 shrink-0 bg-white/50" />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      }
    >
      {isPendingApproval ? (
        <>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Cuenta creada</h1>
          <div className="mt-5">
            <GlassAlert variant="success">
              Tu cuenta como {role === 'empresa' ? 'empresa' : 'martillero'} quedó pendiente de
              aprobación. Un administrador de RematAR la va a revisar y activar antes de que
              puedas iniciar sesión -- te vamos a avisar por email apenas esté lista.
            </GlassAlert>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Crear una cuenta</h1>
          <p className="mt-2 text-[15px] text-white/65">Menos de un minuto. Elegí cómo vas a usar RematAR.</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4" noValidate>
            {error && <GlassAlert variant="error">{error}</GlassAlert>}

            <fieldset>
              <legend className="sr-only">Quiero registrarme como</legend>
              <LayoutGroup id="register-role">
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-white/15">
                  {ROLE_OPTIONS.map((option) => {
                    const isSelected = role === option.value;
                    return (
                      <label
                        key={option.value}
                        className="relative flex h-10 cursor-pointer items-center justify-center rounded-lg text-sm font-medium has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-white/30"
                      >
                        <input
                          type="radio"
                          name="role"
                          value={option.value}
                          checked={isSelected}
                          onChange={() => setRole(option.value)}
                          className="sr-only"
                        />
                        {isSelected && (
                          <motion.span
                            layoutId="register-role-pill"
                            className="absolute inset-0 rounded-lg bg-white"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        )}
                        <span className={`relative transition-colors ${isSelected ? 'text-ink' : 'text-white/70'}`}>
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </LayoutGroup>
              {ROLES_PENDING_APPROVAL.has(role) && (
                <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-white/65">
                  <ShieldCheck aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                  Esta cuenta queda pendiente de aprobación de un administrador antes de poder iniciar sesión.
                </p>
              )}
            </fieldset>

            <GlassField
              label="Nombre completo"
              autoComplete="name"
              required
              icon={User}
              placeholder="Juan Pérez"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              rightElement={isFullNameValid ? validMark : undefined}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <GlassField
                label="Email"
                type="email"
                autoComplete="email"
                required
                icon={Mail}
                placeholder="juan@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                rightElement={isEmailValid ? validMark : undefined}
              />
              <GlassField
                label="Teléfono"
                type="tel"
                autoComplete="tel"
                required
                icon={Phone}
                placeholder="+54 9 11 2345-6789"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                rightElement={isPhoneValid ? validMark : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <GlassField
                label="Contraseña"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                required
                icon={Lock}
                placeholder="Mínimo 8 caracteres"
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
              <GlassField
                label="Confirmar contraseña"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                required
                icon={Lock}
                placeholder="Repetí tu contraseña"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={passwordsMismatch ? 'Las contraseñas no coinciden.' : undefined}
                rightElement={!passwordsMismatch && confirmPassword.length > 0 ? validMark : undefined}
              />
            </div>

            <PasswordRules password={password} />

            <div className="mt-1">
              <GlassSubmitButton isLoading={isSubmitting}>Crear cuenta</GlassSubmitButton>
            </div>
          </form>
        </>
      )}
    </CinematicShell>
  );
}
