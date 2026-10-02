import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../../shared/components/Button';
import type { User } from '../../auth/types';
import { PROFILE_ROLE_LABELS } from '../labels';

const JOIN_DATE_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

/** `"14 de agosto de 2026"` a partir de un ISO 8601 (`User.created_at`). */
function formatJoinDate(iso: string): string {
  return JOIN_DATE_FORMATTER.format(new Date(iso));
}

/** Una sección de "Mi perfil": título (y bajada) a la izquierda, contenido a la derecha. */
export function ProfileSection({
  id,
  title,
  hint,
  prominent = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  /** Primera sección tras la cabecera: línea `ink` y más aire arriba. */
  prominent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`grid gap-6 border-t pt-7 md:grid-cols-[17rem_minmax(0,1fr)] md:gap-16 ${
        prominent ? 'mt-14 border-ink' : 'mt-12 border-line'
      }`}
    >
      <div>
        <h2 id={id} className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {title}
        </h2>
        {hint && <p className="mt-2.5 max-w-[34ch] text-[15px] text-ink-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function ProfileRow({ label, children, muted = false }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="grid items-center gap-1 border-b border-line py-[18px] first:pt-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-x-6">
      <dt className="text-[15px] text-ink-muted">{label}</dt>
      <dd className={`flex flex-wrap items-center gap-2.5 break-words text-[17px] ${muted ? 'text-ink-faint' : 'font-medium'}`}>
        {children}
      </dd>
    </div>
  );
}

export interface PersonalDataSectionProps {
  user: User;
  onEditProfile: () => void;
}

/** "Datos personales": nombre, email y teléfono, con la acción para editarlos al lado de los datos. */
export function PersonalDataSection({ user, onEditProfile }: PersonalDataSectionProps) {
  return (
    <ProfileSection
      id="perfil-datos"
      title="Datos personales"
      hint="Es lo que ven los demás usuarios cuando interactúan con vos."
      prominent
    >
      <dl>
        <ProfileRow label="Nombre y apellido">{user.full_name}</ProfileRow>
        <ProfileRow label="Email">{user.email}</ProfileRow>
        <ProfileRow label="Teléfono" muted={!user.phone}>
          {user.phone ?? 'No especificado'}
        </ProfileRow>
      </dl>
      <div className="mt-6">
        <Button variant="ink-outline" onClick={onEditProfile} className="h-11 rounded-full px-5 text-[15px] font-semibold">
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Editar perfil
        </Button>
      </div>
    </ProfileSection>
  );
}

/**
 * "Cuenta": rol, estado y fecha de creación -- todo sale de `User`, no se inventa nada. Hoy
 * una cuenta pendiente de aprobación no llega a esta pantalla (no puede iniciar sesión), así
 * que el estado distingue solo "Activa" de "Suspendida" por si `is_active` cambia con la sesión abierta.
 */
export function AccountSection({ user }: { user: User }) {
  return (
    <ProfileSection id="perfil-cuenta" title="Cuenta">
      <dl>
        <ProfileRow label="Rol">{PROFILE_ROLE_LABELS[user.role]}</ProfileRow>
        <ProfileRow label="Estado">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${user.is_active ? 'bg-success-600' : 'bg-danger-600'}`}
          />
          {user.is_active ? 'Activa' : 'Suspendida'}
        </ProfileRow>
        <ProfileRow label="Creada el">{formatJoinDate(user.created_at)}</ProfileRow>
      </dl>
    </ProfileSection>
  );
}
