import { Radio } from 'lucide-react';
import { TransitionOverlay } from '../../../shared/components/TransitionOverlay';

export interface RemateStartedOverlayProps {
  isOpen: boolean;
  onDone: () => void;
}

const DISPLAY_MS = 2000;

/**
 * Cartel mostrado al iniciar un remate desde el Dashboard del Rematador, antes de
 * redirigir a la Consola Operativa (`/gestionar`) -- pedido explícito: que iniciar el
 * remate lleve directo a gestionarlo en vivo, sin que el rematador tenga que volver a
 * buscarlo. Mismo patrón visual que `RemateCreatedOverlay` (ver `TransitionOverlay`),
 * con más tiempo en pantalla (2s en vez de 1s) porque el mensaje es más largo y anticipa
 * una navegación, no solo confirma un guardado.
 */
export function RemateStartedOverlay({ isOpen, onDone }: RemateStartedOverlayProps) {
  return (
    <TransitionOverlay
      isOpen={isOpen}
      onDone={onDone}
      displayMs={DISPLAY_MS}
      icon={<Radio aria-hidden="true" className="h-9 w-9" />}
      title="¡Remate en vivo!"
      description="Te estamos llevando a la Consola Operativa para que lo gestiones."
    />
  );
}
