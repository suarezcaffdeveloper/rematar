import { Button } from '../../../shared/components/Button';
import { ProfileRow, ProfileSection } from './ProfileInfoSections';

export interface SecuritySectionProps {
  onChangePassword: () => void;
}

/**
 * Sección "Seguridad" de "Mi perfil" -- deliberadamente mínima: solo la contraseña
 * enmascarada y la acción para cambiarla. Sin 2FA, sesiones activas ni dispositivos --
 * ninguno de esos existe hoy en el backend, y el diseño pide no anticiparlos acá.
 */
export function SecuritySection({ onChangePassword }: SecuritySectionProps) {
  return (
    <ProfileSection id="perfil-seguridad" title="Seguridad" hint="Elegí una contraseña que no uses en ningún otro sitio.">
      <dl>
        <ProfileRow label="Contraseña">
          <span aria-label="Contraseña oculta" className="tracking-[0.28em]">
            ••••••••••
          </span>
        </ProfileRow>
      </dl>
      <div className="mt-6">
        <Button variant="ink-outline" onClick={onChangePassword} className="h-11 rounded-full px-5 text-[15px] font-semibold">
          Cambiar contraseña
        </Button>
      </div>
    </ProfileSection>
  );
}
