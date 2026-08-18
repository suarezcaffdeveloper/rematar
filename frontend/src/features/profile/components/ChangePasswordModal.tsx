import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { useToastStore } from '../../../shared/toast/toastStore';

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
      className="text-slate-400 hover:text-slate-600"
    >
      {isVisible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}

/**
 * Formulario de "Cambiar contraseña". Igual que `EditProfileModal`: no hay todavía un
 * endpoint de backend para cambiar la contraseña de la cuenta propia (`users/router.py`
 * solo tiene `GET /me`, listar y activar/suspender -- ninguno toca la contraseña), así
 * que valida del lado del cliente (mismo mínimo de 8 caracteres que exige el backend al
 * registrarse) pero el envío final solo avisa por toast que la función está en camino,
 * sin pretender haber cambiado nada.
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
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label="Contraseña actual"
          type={isCurrentVisible ? 'text' : 'password'}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={errors.currentPassword}
          rightElement={
            <PasswordVisibilityToggle isVisible={isCurrentVisible} onToggle={() => setIsCurrentVisible((v) => !v)} />
          }
        />
        <Input
          label="Nueva contraseña"
          type={isNewVisible ? 'text' : 'password'}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={errors.newPassword}
          rightElement={<PasswordVisibilityToggle isVisible={isNewVisible} onToggle={() => setIsNewVisible((v) => !v)} />}
        />
        <Input
          label="Confirmar nueva contraseña"
          type={isNewVisible ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
        />
      </div>
    </Modal>
  );
}
