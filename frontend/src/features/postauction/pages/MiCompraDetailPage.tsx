import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { DetalleAside } from '../components/detalle/DetalleAside';
import { DetalleJourney } from '../components/detalle/DetalleJourney';
import { useMiCompraDetail } from '../hooks';

/**
 * Detalle de una compra propia (Épica 7, Módulo 7.5), en `/mis-compras/:caseId` --
 * "seguimiento de compra post-remate" del comprador: qué ganó, cuánto pagó, en qué
 * estado está, qué pasó y qué va a pasar. Solo lectura: cambiar el estado y agregar
 * observaciones son acciones exclusivas del rematador (`VentaAdjudicadaDetailPage`), esta
 * pantalla no las toca.
 *
 * Rediseño (mismo lenguaje visual que el inicio y "Mis compras"): a la izquierda una
 * columna fija con las fotos, el precio y los datos de la compra (`DetalleAside`); a la
 * derecha el recorrido de 8 pasos (`DetalleJourney`), que reúne en un solo hilo lo que
 * antes eran tres bloques -- progreso, "qué sigue" e historial. `useTopNavLayout()` le
 * pide a `AppLayout` la barra superior `BuyerTopNav` en lugar de `Sidebar` + `Header`; sin
 * el `Header` ya no hay breadcrumb a la vista, por eso el link "Mis compras" para volver.
 *
 * `notification_failed` se descarta del historial (ver `detalleUtils.isVisibleToBuyer`):
 * es una señal operativa interna sin ninguna acción posible del lado del comprador.
 */
export function MiCompraDetailPage() {
  useTopNavLayout();
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

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        <Link
          to="/mis-compras"
          className="group mb-6 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          Mis compras
        </Link>

        {isLoading && !data && (
          <div className="grid gap-12 lg:grid-cols-[23rem_minmax(0,1fr)] lg:gap-20">
            <div className="flex flex-col gap-4">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-10 w-1/2" />
            </div>
            <div className="flex flex-col gap-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-28 w-full max-w-3xl" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        )}

        {(error || (!isLoading && !data)) && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error?.message ?? 'No se pudo cargar esta compra.'}</span>
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            </div>
          </Alert>
        )}

        {data && !error && (
          <div className="grid gap-12 pb-20 lg:grid-cols-[23rem_minmax(0,1fr)] lg:gap-20">
            <DetalleAside detail={data} />
            <DetalleJourney detail={data} />
          </div>
        )}
      </div>
    </div>
  );
}
