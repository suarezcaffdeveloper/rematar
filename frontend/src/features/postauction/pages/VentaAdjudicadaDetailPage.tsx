import { useParams } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
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
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{data.lote_title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lote {data.lot_number} · {data.remate_title}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white p-5">
        <ProgressStepper status={data.status} />

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-brand-100 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precio final</p>
            <p className="text-3xl font-extrabold tabular-nums text-brand-700 sm:text-4xl">
              {formatCurrency(data.final_price, 'ARS')}
            </p>
          </div>
          <dl className="flex flex-col gap-1 text-sm text-slate-600">
            <div className="flex gap-1.5">
              <dt className="text-slate-400">Comprador:</dt>
              <dd className="font-medium text-slate-900">{data.buyer_name ?? '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-slate-400">Adjudicado el:</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(data.created_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {data.notes && (
        <Card>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Última observación</h2>
          <p className="text-sm text-slate-700">{data.notes}</p>
        </Card>
      )}

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
