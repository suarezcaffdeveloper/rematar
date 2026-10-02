import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { FinishedRemateList } from '../components/FinishedRemateList';

/**
 * Historial de remates de la empresa (Épica 7, Módulo 7.3; rediseño editorial), en
 * `/historial` -- sus propios remates finalizados y cancelados (`FinishedRemateList` sin
 * `showOwner`: siempre son los suyos). El backend (`HistoryService.list_finished`) fuerza el
 * scope al dueño autenticado; un `comprador` que llegara acá por URL directa recibe 403 del
 * backend (sin `RequireRole` a nivel de ruta, mismo criterio que el resto de rutas de
 * remate). `useTopNavLayout()` pide la misma barra superior que el comprador y deja que la
 * página arme su propio contenedor. Ver docs/37-historial-y-resultados-de-remates.md.
 */
export function RemateHistoryListPage() {
  useTopNavLayout();
  useBreadcrumb([{ label: 'Mis remates', to: '/' }, { label: 'Historial' }]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <FinishedRemateList />
      </div>
    </div>
  );
}
