import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { FinishedRemateList } from '../components/FinishedRemateList';

/**
 * Historial de remates del rematador (Épica 7, Módulo 7.3), en `/historial` -- listado
 * de sus propios remates finalizados/cancelados (`FinishedRemateList` sin `showOwner`:
 * siempre son los suyos, mostrar su propio nombre en cada tarjeta sería ruido). El
 * backend (`HistoryService.list_finished`) fuerza el scope al dueño autenticado; un
 * `comprador` que llegara acá por URL directa recibe 403 del backend (sin `RequireRole`
 * a nivel de ruta, mismo criterio que el resto de rutas de remate). Ver
 * docs/37-historial-y-resultados-de-remates.md.
 */
export function RemateHistoryListPage() {
  useBreadcrumb([{ label: 'Mis remates', to: '/' }, { label: 'Historial' }]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Historial de remates</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Resultados de tus remates finalizados y cancelados.
        </p>
      </div>

      <FinishedRemateList />
    </div>
  );
}
