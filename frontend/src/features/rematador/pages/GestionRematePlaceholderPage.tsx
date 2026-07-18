import { useNavigate, useParams } from 'react-router-dom';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { GavelIcon } from '../../remates/components/icons';

/**
 * Destino de "Administrar remate" en `RematadorRemateCard` (Épica 5, Módulo 5.1).
 * Placeholder deliberado -- mismo patrón que `SalaPlaceholderPage` cumplió para la Sala
 * del Remate (Épica 4.4 -> 4.5): la ruta y el punto de entrada ya quedan resueltos acá,
 * para que la Consola Operativa del Rematador (Módulo 5.2 -- abrir/cerrar lotes, seguir
 * ofertas en vivo, pausar el remate) reemplace únicamente este archivo, sin tocar el
 * árbol de rutas ni `RematadorRemateCard`.
 */
export function GestionRematePlaceholderPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: 'Administrar remate' }]} />
      <EmptyState
        icon={<GavelIcon className="h-10 w-10" />}
        title="Consola operativa en construcción"
        description="Abrir y cerrar lotes, seguir ofertas en vivo y pausar el remate se agregan en el próximo módulo."
        action={
          <Button variant="secondary" onClick={() => navigate(`/remates/${remateId}`)}>
            Ver ficha del remate
          </Button>
        }
      />
    </div>
  );
}
