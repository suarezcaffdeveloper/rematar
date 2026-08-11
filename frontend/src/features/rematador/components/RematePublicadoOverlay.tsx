import { TransitionOverlay } from '../../../shared/components/TransitionOverlay';
import { SendIcon } from './icons';

export interface RematePublicadoOverlayProps {
  isOpen: boolean;
  onDone: () => void;
}

const DISPLAY_MS = 2000;

/**
 * Cartel mostrado al publicar un remate desde Gestión de Lotes, antes de redirigir a
 * "Mis remates" -- mismo patrón y mismo `TransitionOverlay` que `RemateStartedOverlay`
 * (cartel + slider + panel de carga), pedido explícito: que los dos flujos de
 * redirección automática se sientan iguales.
 */
export function RematePublicadoOverlay({ isOpen, onDone }: RematePublicadoOverlayProps) {
  return (
    <TransitionOverlay
      isOpen={isOpen}
      onDone={onDone}
      displayMs={DISPLAY_MS}
      icon={<SendIcon className="h-9 w-9" />}
      title="¡Remate publicado!"
      description="Te redirigimos a Mis remates -- ahí lo vas a poder ver programado."
    />
  );
}
