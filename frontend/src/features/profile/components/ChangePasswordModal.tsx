import { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { useToastStore } from '../../../shared/toast/toastStore';
import { ProfileField } from './ProfileField';

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** Mismo largo mínimo que exige el backend para cualquier contraseña
 * (`UserCreate.password`, `backend/app/modules/users/schemas.py`). */
const MIN_PASSWORD_LENGTH = 8;

function PasswordVisibilityToggle({ isVisible, onToggle }: { isVisible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {isVisible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}

/** Requisito de la nueva contraseña que se tilda mientras se escribe. */
function Requirement({ met, children }: { met: boolean; children: string }) {
  return (
    <li className={clsx('flex items-center gap-2.5 text-sm', met ? 'text-ink' : 'text-ink-muted')}>
      <span
        aria-hidden="true"
        className={clsx(
          'flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] transition-colors',
          met ? 'border-success-600 bg-success-600 text-white' : 'border-line-strong text-transparent',
        )}
      >
        <Check className="h-[11px] w-[11px]" strokeWidth={3} />
      </span>
      {children}
      <span className="sr-only">{met ? '(cumplido)' : '(pendiente)'}</span>
    </li>
  );
}

/**
 * Formulario de "Cambiar contraseña" (rediseño editorial, mismo estilo que `EditProfileModal`).
 * No hay todavía un endpoint de backend para cambiar la contraseña de la cuenta propia
 * (`users/router.py` solo tiene `GET /me`, listar y activar/suspender -- ninguno toca la
 * contraseña), así que valida del lado del cliente (mismo mínimo de 8 caracteres que exige el
 * backend al registrarse) pero el envío final solo avisa por toast que la función está en
 * camino, sin pretender haber cambiado nada.
 */
export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isCurrentVisible, setIsCurrentVisible] = useState(false);
  const [isNewVisible, setIsNewVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function validate(): boolean {
    const nextErrors: FieldErrors = {};
    if (!currentPassword) {
      nextErrors.currentPassword = 'Ingresá tu contraseña actual.';
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.newPassword = `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = 'Las contraseñas no coinciden.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    useToastStore.getState().push('info', 'El cambio de contraseña estará disponible próximamente.');
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cambiar contraseña"
      size="md"
      hideHeader
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="h-11 rounded-full px-5 text-[15px] font-semibold">
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} className="h-11 rounded-full px-5 text-[15px] font-semibold">
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7 pt-4 font-display text-ink">
        <div className="pr-10">
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight">Cambiar contraseña</h2>
          <p className="mt-2.5 max-w-[46ch] text-[15px] text-ink-muted">
            Ingresá la actual y elegí una nueva. Vas a seguir con la sesión iniciada.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <ProfileField
            label="Contraseña actual"
            type={isCurrentVisible ? 'text' : 'password'}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            error={errors.currentPassword}
            autoComplete="current-password"
            rightElement={
              <PasswordVisibilityToggle isVisible={isCurrentVisible} onToggle={() => setIsCurrentVisible((v) => !v)} />
            }
          />
          <ProfileField
            label="Nueva contraseña"
            type={isNewVisible ? 'text' : 'password'}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errors.newPassword}
            autoComplete="new-password"
            rightElement={<PasswordVisibilityToggle isVisible={isNewVisible} onToggle={() => setIsNewVisible((v) => !v)} />}
          />
          <ProfileField
            label="Repetir nueva contraseña"
            type={isNewVisible ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />
        </div>

        <ul aria-label="Requisitos de la contraseña" className="grid gap-2">
          <Requirement met={newPassword.length >= MIN_PASSWORD_LENGTH}>{`Al menos ${MIN_PASSWORD_LENGTH} caracteres`}</Requirement>
          <Requirement met={newPassword.length > 0 && newPassword === confirmPassword}>
            Las dos contraseñas coinciden
          </Requirement>
        </ul>
      </div>
    </Modal>
  );
}
