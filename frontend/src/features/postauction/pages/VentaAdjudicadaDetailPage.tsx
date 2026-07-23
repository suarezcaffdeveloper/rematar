import { useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { NoteForm } from '../components/NoteForm';
import { ProgressStepper } from '../components/ProgressStepper';
import { StatusBadge } from '../components/StatusBadge';
import { StatusChangeForm } from '../components/StatusChangeForm';
import { Timeline } from '../components/Timeline';
import { useVentaDetail } from '../hooks';

/**
 * Detalle de una venta adjudicada (Épica 7, Módulo 7.5), en
 * `/ventas-adjudicadas/:caseId` -- info del lote/comprador, indicador de progreso,
 * acciones del rematador (cambiar estado, agregar observaciones) y línea de tiempo.
 */
export function VentaAdjudicadaDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const id = caseId ?? '';
  const { data, isLoading, error, reload } = useVentaDetail(id);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: 'Venta no encontrada' }]} />
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
      <Breadcrumb
        items={[
          { label: 'Mis remates', to: '/' },
          { label: 'Ventas adjudicadas', to: '/ventas-adjudicadas' },
          { label: data.lote_title },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{data.lote_title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lote {data.lot_number} · {data.remate_title}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <Card>
        <ProgressStepper status={data.status} />
      </Card>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Comprador</span>
          <span className="font-medium text-slate-900">{data.buyer_name ?? '—'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Precio final</span>
          <span className="font-medium text-slate-900">{formatCurrency(data.final_price, 'ARS')}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Adjudicado el</span>
          <span className="font-medium text-slate-900">{formatDateTime(data.created_at)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Última observación</span>
          <span className="font-medium text-slate-900">{data.notes ?? '—'}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Cambiar estado</h2>
          <StatusChangeForm caseId={data.id} currentStatus={data.status} onChanged={reload} />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Observaciones</h2>
          <NoteForm caseId={data.id} onAdded={reload} />
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Línea de tiempo</h2>
        <Timeline entries={data.timeline} />
      </div>
    </div>
  );
}
