import { Lock } from 'lucide-react';
import { PrivateAccessCredentials } from './PrivateAccessCredentials';
import type { Remate } from '../../remates/types';

export interface PrivateAccessPanelProps {
  remate: Remate;
}

/**
 * Franja "Datos de acceso privado" de la Consola Operativa, visible solo para la
 * empresa dueña de un remate `access_type: 'private'` -- mismo patrón visual que
 * `OperatorCodePanel` ("Datos para el martillero"), adaptado para compartir
 * credenciales con compradores en vez de con un rematador operador.
 *
 * Es solo el marco visual de la consola: el fetch/display/copiar/regenerar del código
 * en sí vive en `PrivateAccessCredentials`, compartido con el popover de la card del
 * dashboard (`PrivateAccessCredentialsPopover`) -- mismo código en los dos lugares, sin
 * requerir un clic previo para verlo (ver `PrivateAccessCredentials` sobre por qué el
 * código ya no se muestra "una única vez por generación").
 */
export function PrivateAccessPanel({ remate }: PrivateAccessPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Lock aria-hidden="true" className="h-4 w-4" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Datos de acceso privado
        </span>
      </div>

      <span aria-hidden="true" className="h-7 w-px shrink-0 bg-brand-200" />

      <PrivateAccessCredentials remate={remate} />
    </div>
  );
}
