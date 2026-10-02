import { UserAvatar } from '../../../shared/components/UserAvatar';
import type { User } from '../../auth/types';
import { PROFILE_ROLE_LABELS, PROFILE_ROLE_LEADS } from '../labels';

export interface ProfileHeaderSectionProps {
  user: User;
  /** Abre "Editar perfil" -- el mismo modal sirve para cambiar la foto. */
  onEditProfile: () => void;
}

/**
 * Cabecera editorial de "Mi perfil": el nombre del usuario es el titular, con su avatar al
 * lado, una línea que dice para qué sirve la cuenta según el rol, y debajo el rol y el email.
 * "Cambiar foto" abre el mismo modal que "Editar perfil" (la foto se guarda ahí).
 *
 * Sin foto propia ni avatar predeterminado elegido, cae al avatar por defecto (iniciales
 * sobre fondo de marca, ver `UserAvatar`).
 */
export function ProfileHeaderSection({ user, onEditProfile }: ProfileHeaderSectionProps) {
  return (
    <header className="grid grid-cols-1 items-start gap-7 min-[561px]:grid-cols-[auto_minmax(0,1fr)] min-[561px]:items-end">
      <div className="grid justify-items-start gap-2.5">
        <UserAvatar avatarUrl={user.avatar_url} fullName={user.full_name} size="xl" />
        <button
          type="button"
          onClick={onEditProfile}
          className="rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline hover:underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Cambiar foto
        </button>
      </div>

      <div className="min-w-0">
        <p className="mb-3.5 text-ink-muted">Mi perfil</p>
        <h1 className="text-balance break-words text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          {user.full_name}
        </h1>
        <p className="mt-4 max-w-[58ch] text-lg text-ink-muted">{PROFILE_ROLE_LEADS[user.role]}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <span className="inline-flex h-[30px] items-center rounded-full border border-ink px-3.5 text-sm font-semibold">
            {PROFILE_ROLE_LABELS[user.role]}
          </span>
          <span className="break-all text-ink-muted">{user.email}</span>
        </div>
      </div>
    </header>
  );
}
