import { Check } from 'lucide-react';
import clsx from 'clsx';
import { UserAvatar } from '../../../shared/components/UserAvatar';
import { AVATAR_PRESETS, presetAvatarUrl } from '../../../shared/lib/avatarPresets';

export interface AvatarPresetPickerProps {
  selectedAvatarUrl: string | null;
  onSelect: (avatarUrl: string) => void;
}

/**
 * Grilla de los 6 avatares predeterminados (`shared/lib/avatarPresets.ts`) -- para
 * quien no quiere subir una foto propia. `grid-cols-3 sm:grid-cols-6`: en mobile,
 * angosto por el padding del modal, 6 en una sola fila queda demasiado apretado.
 */
export function AvatarPresetPicker({ selectedAvatarUrl, onSelect }: AvatarPresetPickerProps) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {AVATAR_PRESETS.map((preset) => {
        const avatarUrl = presetAvatarUrl(preset.id);
        const isSelected = selectedAvatarUrl === avatarUrl;

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(avatarUrl)}
            aria-label={`Usar avatar ${preset.label}`}
            aria-pressed={isSelected}
            className={clsx(
              'relative flex items-center justify-center rounded-full transition-shadow focus:outline-none',
              'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
              isSelected && 'ring-2 ring-brand-600 ring-offset-2',
            )}
          >
            <UserAvatar avatarUrl={avatarUrl} fullName="" size="md" />
            {isSelected && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white">
                <Check aria-hidden="true" className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
