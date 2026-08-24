import { useParams } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { BuyerCard } from '../components/BuyerCard';
import { DocumentationCard } from '../components/DocumentationCard';
import { LastObservationCard } from '../components/LastObservationCard';
import { LoteInfoCard } from '../components/LoteInfoCard';
import { NoteForm } from '../components/NoteForm';
import { OperationInfoCard } from '../components/OperationInfoCard';
import { ProgressStepper } from '../components/ProgressStepper';
import { SaleHeader } from '../components/SaleHeader';
import { StatusChangeForm } from '../components/StatusChangeForm';
import { Timeline } from '../components/Timeline';
import { useVentaDetail } from '../hooks';

/**
 * Detalle de una venta adjudicada (Épica 7, Módulo 7.5), en
 * `/ventas-adjudicadas/:caseId` -- ficha de gestión post-remate: header con lo esencial
 * (lote, precio final, estado), comprador + operación, stepper de estado, acciones del
 * rematador (cambiar estado, agregar observaciones), lote + documentación, y línea de
 * tiempo. Rediseño visual (sección "20. Forma de trabajo" del pedido); la lógica de datos
 * -- `useVentaDetail`, loading/error, `reload` tras cada mutación -- no cambió.
 */
export function VentaAdjudicadaDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const id = caseId ?? '';
  const { data, isLoading, error, reload } = useVentaDetail(id);

  const items: BreadcrumbItem[] =
    isLoading && !data
      ? []
      : error || !data
        ? [{ label: 'Mis remates', to: '/' }, { label: 'Venta no encontrada' }]
        : [
            { label: 'Mis remates', to: '/' },
            { label: 'Ventas adjudicadas', to: '/ventas-adjudicadas' },
            { label: data.lote_title },
          ];
  useBreadcrumb(items);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error?.message ?? 'No se pudo cargar esta venta.'}</span>
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SaleHeader data={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BuyerCard data={data} />
        <OperationInfoCard data={data} />
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Estado de la venta</h2>
        <ProgressStepper status={data.status} />
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Gestión de la venta</h2>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-8">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Cambiar estado
              </h3>
              <StatusChangeForm caseId={data.id} currentStatus={data.status} onChanged={reload} />
            </div>
            <div className="border-t border-slate-100 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Nueva observación
              </h3>
              <NoteForm caseId={data.id} onAdded={reload} />
            </div>
          </div>
        </Card>
        <LastObservationCard data={data} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LoteInfoCard data={data} />
        <DocumentationCard caseId={data.id} documents={data.documents} onChanged={reload} />
      </div>

      <div id="actividad" className="flex flex-col gap-2 scroll-mt-4">
        <h2 className="text-lg font-semibold text-slate-900">Actividad</h2>
        <Timeline entries={data.timeline} />
      </div>
    </div>
  );
}
