import { useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { ProgressStepper } from '../components/ProgressStepper';
import { StatusBadge } from '../components/StatusBadge';
import { Timeline } from '../components/Timeline';
import { useMiCompraDetail } from '../hooks';

/**
 * Detalle de una compra propia (Épica 7, Módulo 7.5), en `/mis-compras/:caseId` --
 * información del rematador, historial del proceso y observaciones (pedido explícito del
 * enunciado). Solo lectura: cambiar el estado y agregar observaciones son acciones
 * exclusivas del rematador (`VentaAdjudicadaDetailPage`).
 */
export function MiCompraDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const id = caseId ?? '';
  const { data, isLoading, error } = useMiCompraDetail(id);

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
        <Breadcrumb items={[{ label: 'Mis compras', to: '/mis-compras' }, { label: 'Compra no encontrada' }]} />
        <Alert variant="error">{error?.message ?? 'No se pudo cargar esta compra.'}</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: 'Inicio', to: '/' },
          { label: 'Mis compras', to: '/mis-compras' },
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
          <span className="text-xs text-slate-500">Rematador</span>
          <span className="font-medium text-slate-900">{data.rematador_name ?? '—'}</span>
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
          <span className="text-xs text-slate-500">Observaciones</span>
          <span className="font-medium text-slate-900">{data.notes ?? '—'}</span>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Historial del proceso</h2>
        <Timeline entries={data.timeline} />
      </div>
    </div>
  );
}
