import avatarBob from '../../assets/avatars/avatar-bob.jpg';
import avatarBeard from '../../assets/avatars/avatar-beard.jpg';
import avatarBlonde from '../../assets/avatars/avatar-blonde.jpg';
import avatarCurly from '../../assets/avatars/avatar-curly.jpg';
import avatarSenior from '../../assets/avatars/avatar-senior.jpg';
import avatarRedhead from '../../assets/avatars/avatar-redhead.jpg';

/**
 * Avatares predeterminados para "Mi perfil" -- para el usuario que no quiere subir una
 * foto propia (`features/profile/components/EditProfileModal.tsx`). Cada uno es una
 * ilustración fija empaquetada como asset (`src/assets/avatars/`), identificados con el
 * string `"preset:<id>"` en `User.avatar_url` en vez de la URL real de la imagen --
 * `UserAvatar` es el único componente que interpreta ese formato.
 */
export interface AvatarPreset {
  id: string;
  label: string;
  image: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'bob', label: 'Morocha', image: avatarBob },
  { id: 'beard', label: 'Barba', image: avatarBeard },
  { id: 'blonde', label: 'Rubia', image: avatarBlonde },
  { id: 'curly', label: 'Rulos', image: avatarCurly },
  { id: 'senior', label: 'Canoso', image: avatarSenior },
  { id: 'redhead', label: 'Pelirrojo', image: avatarRedhead },
];

const PRESET_PREFIX = 'preset:';

export function presetAvatarUrl(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

/** `true` si `avatarUrl` tiene el formato de avatar predeterminado -- distingue "es un
 * preset (conocido o no)" de "es una URL de foto real", que `UserAvatar` necesita
 * decidir ANTES de buscar el preset: un id desconocido no debe terminar en un `<img
 * src="preset:...">` roto. */
export function isPresetAvatar(avatarUrl: string): boolean {
  return avatarUrl.startsWith(PRESET_PREFIX);
}

export function getAvatarPreset(avatarUrl: string): AvatarPreset | undefined {
  if (!isPresetAvatar(avatarUrl)) return undefined;
  const id = avatarUrl.slice(PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((preset) => preset.id === id);
}
