import clsx from 'clsx';
import { getAvatarPreset, isPresetAvatar } from '../lib/avatarPresets';

export interface UserAvatarProps {
  /** `User.avatar_url` -- `null`/`undefined` cae al avatar por defecto (iniciales). */
  avatarUrl: string | null | undefined;
  fullName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  // Fila de chat (`ChatMessageItem`) -- más chico que `sm` para no competir con el
  // texto del mensaje en una fila angosta.
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl sm:h-24 sm:w-24 sm:text-2xl',
};

/** `"Ana Rematadora"` -> `"AR"`. */
function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Avatar de usuario -- único lugar de la app que decide cómo renderizar
 * `User.avatar_url` en sus tres formatos posibles (ver su docstring en
 * `features/auth/types.ts`): foto propia (URL real), avatar predeterminado
 * (`"preset:<id>"`, ver `shared/lib/avatarPresets.ts`) o, sin ninguno de los dos, el
 * avatar por defecto (iniciales sobre fondo de marca). Usado tanto en el pie del
 * sidebar (`sm`) como en "Mi perfil" (`lg` en el encabezado, `md` en el modal de
 * edición) -- antes cada lugar reimplementaba las iniciales a mano por separado.
 */
export function UserAvatar({ avatarUrl, fullName, size = 'md', className }: UserAvatarProps) {
  const sizeClasses = SIZE_CLASSES[size];

  if (avatarUrl && isPresetAvatar(avatarUrl)) {
    const preset = getAvatarPreset(avatarUrl);
    // Id de preset desconocido (dato corrupto/versión vieja del catálogo): cae al
    // avatar por defecto más abajo en vez de intentar tratarlo como URL de imagen
    // real -- "preset:..." nunca es una imagen que exista.
    if (preset) {
      return (
        <img
          src={preset.image}
          alt=""
          className={clsx('shrink-0 rounded-full object-cover', sizeClasses, className)}
        />
      );
    }
  } else if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={clsx('shrink-0 rounded-full object-cover', sizeClasses, className)} />;
  }

  return (
    <div
      aria-hidden="true"
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700',
        sizeClasses,
        className,
      )}
    >
      {getInitials(fullName)}
    </div>
  );
}
