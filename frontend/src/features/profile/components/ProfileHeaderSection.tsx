import { Mail, Pencil } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { UserAvatar } from '../../../shared/components/UserAvatar';
import type { User } from '../../auth/types';
import { PROFILE_ROLE_LABELS } from '../labels';

const JOIN_DATE_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

/** `"14 de agosto de 2026"` a partir de un ISO 8601 (`User.created_at`). */
function formatJoinDate(iso: string): string {
  return JOIN_DATE_FORMATTER.format(new Date(iso));
}

export interface ProfileHeaderSectionProps {
  user: User;
  onEditProfile: () => void;
}

/**
 * Presentación del usuario en la parte superior de "Mi perfil": foto/avatar, nombre,
 * rol y email como identidad principal; debajo, la grilla de datos de cuenta
 * (nombre, email, teléfono) y por último la fecha de creación con jerarquía visual
 * secundaria (texto chico y apagado, sin protagonismo -- pedido explícito de diseño).
 *
 * Sin foto propia ni avatar predeterminado elegido, cae al avatar por defecto
 * (iniciales sobre fondo de marca, ver `UserAvatar`) -- el estado "sin foto personal"
 * que el diseño pide contemplar.
 */
export function ProfileHeaderSection({ user, onEditProfile }: ProfileHeaderSectionProps) {
  return (
    <section>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4 sm:gap-5">
          <UserAvatar avatarUrl={user.avatar_url} fullName={user.full_name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">{user.full_name}</h1>
            <div className="mt-1.5">
              <Badge variant="brand">{PROFILE_ROLE_LABELS[user.role]}</Badge>
            </div>
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-slate-500">
              <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.email}</span>
            </p>
          </div>
        </div>

        <Button variant="secondary" onClick={onEditProfile} className="self-start">
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Editar perfil
        </Button>
      </div>

      <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-slate-100 pt-8 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Nombre y apellido</dt>
          <dd className="mt-1 text-sm text-slate-800">{user.full_name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</dt>
          <dd className="mt-1 text-sm text-slate-800">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Teléfono</dt>
          <dd className="mt-1 text-sm text-slate-800">{user.phone ?? 'No especificado'}</dd>
        </div>
      </dl>

      <p className="mt-6 text-xs text-slate-400">Cuenta creada el {formatJoinDate(user.created_at)}</p>
    </section>
  );
}
