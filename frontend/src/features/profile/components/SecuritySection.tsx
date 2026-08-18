import { ShieldCheck } from 'lucide-react';
import { Button } from '../../../shared/components/Button';

export interface SecuritySectionProps {
  onChangePassword: () => void;
}

/**
 * Sección "Seguridad" de "Mi perfil" -- deliberadamente mínima (pedido explícito de
 * diseño): solo la contraseña enmascarada y la acción para cambiarla. Sin 2FA, sesiones
 * activas ni dispositivos -- ninguno de esos existe hoy en el backend, y el diseño pide
 * no anticiparlos acá.
 */
export function SecuritySection({ onChangePassword }: SecuritySectionProps) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Seguridad</h2>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-700">Contraseña</p>
            <p className="mt-0.5 tracking-widest text-slate-400">••••••••••</p>
          </div>
        </div>

        <Button variant="secondary" onClick={onChangePassword} className="shrink-0">
          Cambiar contraseña
        </Button>
      </div>
    </section>
  );
}
