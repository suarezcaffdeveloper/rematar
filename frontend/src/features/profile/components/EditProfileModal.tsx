import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { UserAvatar } from '../../../shared/components/UserAvatar';
import { useToastStore } from '../../../shared/toast/toastStore';
import { validateImageFile } from '../../rematador/media';
import { useAuthActions } from '../../auth/hooks';
import type { User } from '../../auth/types';
import { updateUserAvatarRequest, uploadUserAvatarRequest } from '../api';
import { AvatarPresetPicker } from './AvatarPresetPicker';
import { ProfileField } from './ProfileField';

export interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

/**
 * Formulario de "Editar perfil" (rediseño editorial: encabezado propio con `hideHeader`,
 * campos con línea inferior, botones en píldora). La foto de perfil (subida propia o avatar
 * predeterminado) se guarda al toque -- `POST /users/me/avatar` + `PATCH /users/me`
 * (ver `features/profile/api.ts`) -- y actualiza el store de sesión (`updateUser`) para
 * que se vea reflejada en el acto en toda la app (barra superior incluida), sin depender del
 * botón "Guardar cambios" del pie.
 *
 * Nombre/email/teléfono siguen sin backend (`GET /users/me` es de solo lectura para
 * esos campos, ver `backend/app/modules/users/schemas.py::UserAvatarUpdate`) -- mismo
 * criterio ya establecido en `LoginPage` para "¿Olvidaste tu contraseña?": en vez de
 * simular un guardado exitoso, avisa por toast que la función está en camino.
 */
export function EditProfileModal({ isOpen, onClose, user }: EditProfileModalProps) {
  const { updateUser } = useAuthActions();
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  /** Persiste `nextAvatarUrl` vía `PATCH /users/me` y refleja el resultado en el store
   * de sesión -- deliberadamente NO maneja `isSavingAvatar`/`avatarError`/blob URLs
   * (relanza en error): cada uno de los tres disparadores (subir archivo, elegir
   * preset, quitar foto) necesita un manejo distinto alrededor (revertir el preview
   * local solo aplica a la subida, por ejemplo), así que esa parte queda del lado de
   * cada handler en vez de duplicarse acá adentro. */
  async function persistAvatar(nextAvatarUrl: string | null) {
    const updated = await updateUserAvatarRequest(nextAvatarUrl);
    setAvatarUrl(updated.avatar_url);
    updateUser({ avatar_url: updated.avatar_url });
    useToastStore.getState().push('success', 'Foto de perfil actualizada.');
  }

  async function handlePresetOrRemove(nextAvatarUrl: string | null) {
    setIsSavingAvatar(true);
    setAvatarError(null);
    try {
      await persistAvatar(nextAvatarUrl);
    } catch (err) {
      setAvatarError(normalizeApiError(err).message);
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setAvatarUrl(objectUrlRef.current);
    setIsSavingAvatar(true);
    setAvatarError(null);

    try {
      const { url } = await uploadUserAvatarRequest(file);
      await persistAvatar(url);
    } catch (err) {
      setAvatarError(normalizeApiError(err).message);
      setAvatarUrl(user.avatar_url);
    } finally {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setIsSavingAvatar(false);
    }
  }

  function handleSubmit() {
    useToastStore.getState().push('info', 'La edición de nombre, email y teléfono estará disponible próximamente.');
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar perfil"
      size="md"
      hideHeader
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="h-11 rounded-full px-5 text-[15px] font-semibold">
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} className="h-11 rounded-full px-5 text-[15px] font-semibold">
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7 pt-4 font-display text-ink">
        <div className="pr-10">
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight">Editar perfil</h2>
          <p className="mt-2.5 max-w-[46ch] text-[15px] text-ink-muted">Cambiá tu foto y tus datos de contacto.</p>
        </div>

        <section aria-labelledby="edit-photo-title">
          <h3 id="edit-photo-title" className="mb-3 font-semibold">
            Foto de perfil
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <UserAvatar avatarUrl={avatarUrl} fullName={fullName} size="md" />
              {isSavingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40">
                  <Spinner size="sm" className="text-white" />
                </div>
              )}
            </div>
            <div className="grid justify-items-start gap-2">
              <Button
                variant="ink-outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSavingAvatar}
                className="h-[38px] rounded-full px-4 font-semibold"
              >
                <Camera aria-hidden="true" className="h-4 w-4" />
                Subir una foto
              </Button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handlePresetOrRemove(null)}
                  disabled={isSavingAvatar}
                  className="rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline hover:underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"
                >
                  Quitar foto
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void handleFileChange(event)}
                className="sr-only"
              />
            </div>
          </div>

          <p className="mb-2.5 mt-5 text-sm text-ink-muted">O elegí un avatar predeterminado</p>
          <AvatarPresetPicker selectedAvatarUrl={avatarUrl} onSelect={(url) => void handlePresetOrRemove(url)} />

          {avatarError && <p className="mt-2 text-[13px] text-danger-600">{avatarError}</p>}
        </section>

        <hr className="border-line" />

        <div className="flex flex-col gap-5">
          <ProfileField
            label="Nombre y apellido"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />
          <ProfileField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <ProfileField
            label="Teléfono"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="+54 9 11 1234-5678"
            help="Opcional. Lo usamos solo para coordinar entregas y pagos."
          />
        </div>
      </div>
    </Modal>
  );
}
