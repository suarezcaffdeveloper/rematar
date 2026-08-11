import { CheckCircle2 } from 'lucide-react';
import { TransitionOverlay } from '../../../shared/components/TransitionOverlay';

export interface RemateCreatedOverlayProps {
  isOpen: boolean;
  onDone: () => void;
}

/**
 * Pantalla de transición mostrada tras crear un remate, antes de redirigir al panel de
 * carga de lotes (rediseño UX del flujo de creación de lotes) -- reemplaza la navegación
 * inmediata por una confirmación breve y explícita. Ver `TransitionOverlay` para el
 * comportamiento común con `RemateStartedOverlay` (mismo cartel, distinto momento).
 */
export function RemateCreatedOverlay({ isOpen, onDone }: RemateCreatedOverlayProps) {
  return (
    <TransitionOverlay
      isOpen={isOpen}
      onDone={onDone}
      displayMs={1000}
      icon={<CheckCircle2 aria-hidden="true" className="h-9 w-9" />}
      title="Remate creado correctamente"
      description="Ahora te llevaremos al panel donde podrás comenzar a cargar los lotes del remate."
    />
  );
}
