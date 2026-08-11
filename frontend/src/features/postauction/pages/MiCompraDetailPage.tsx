import { useParams } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { LoteInfoCard } from '../components/LoteInfoCard';
import { ObservationsFeed } from '../components/ObservationsFeed';
import { ProgressStepper } from '../components/ProgressStepper';
import { PurchaseHeader } from '../components/PurchaseHeader';
import { PurchaseNextStepCard } from '../components/PurchaseNextStepCard';
import { PurchaseSummaryCard } from '../components/PurchaseSummaryCard';
import { RematadorInfoCard } from '../components/RematadorInfoCard';
import { Timeline } from '../components/Timeline';
import { useMiCompraDetail } from '../hooks';

/**
 * Detalle de una compra propia (Épica 7, Módulo 7.5), en `/mis-compras/:caseId` --
 * "seguimiento de compra post-remate" del comprador: qué ganó, cuánto pagó, en qué
 * estado está, qué pasó y qué va a pasar. Rediseño completo de jerarquía visual (pedido
 * explícito): estado + próximo paso arriba, historial técnico abajo con menor peso.
 * Solo lectura: cambiar el estado y agregar observaciones son acciones exclusivas del
 * rematador (`VentaAdjudicadaDetailPage`), esta pantalla no las toca.
 *
 * `notification_failed` se filtra del timeline acá (no en `Timeline.tsx`, que sigue
 * compartido con el rematador): es una señal operativa interna (falló un canal de
 * notificación) sin ninguna acción posible del lado del comprador, no un evento de "qué
 * pasó con mi compra" -- mostrarla ahí solo genera la impresión de que algo está roto.
 */
export function MiCompraDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const id = caseId ?? '';
  const { data, isLoading, error, reload } = useMiCompraDetail(id);

  const items: BreadcrumbItem[] =
    isLoading && !data
      ? []
      : error || !data
        ? [{ label: 'Mis compras', to: '/mis-compras' }, { label: 'Compra no encontrada' }]
        : [{ label: 'Inicio', to: '/' }, { label: 'Mis compras', to: '/mis-compras' }, { label: data.lote_title }];
  useBreadcrumb(items);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error?.message ?? 'No se pudo cargar esta compra.'}</span>
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  const visibleTimeline = data.timeline.filter((entry) => entry.action !== 'notification_failed');

  return (
    <div className="flex flex-col gap-6">
      <PurchaseHeader data={data} />

      <Card>
        <h2 className="mb-5 text-sm font-semibold text-slate-900">Progreso de tu compra</h2>
        <ProgressStepper status={data.status} />
      </Card>

      <PurchaseNextStepCard data={data} />

      <PurchaseSummaryCard data={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LoteInfoCard data={data} />
        <RematadorInfoCard data={data} />
      </div>

      <ObservationsFeed data={data} />

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-700">Historial del proceso</h2>
        <Timeline entries={visibleTimeline} />
      </div>
    </div>
  );
}
