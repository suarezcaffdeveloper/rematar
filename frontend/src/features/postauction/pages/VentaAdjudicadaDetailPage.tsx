import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency } from '../../../shared/lib/format';
import { BuyerCard } from '../components/BuyerCard';
import { DocumentationCard } from '../components/DocumentationCard';
import { LastObservationCard } from '../components/LastObservationCard';
import { LoteInfoCard } from '../components/LoteInfoCard';
import { OperationInfoCard } from '../components/OperationInfoCard';
import { SaleCover } from '../components/sales/SaleCover';
import { SaleJourney } from '../components/sales/SaleJourney';
import { LatePill, SaleStatusPill } from '../components/sales/SaleStatusPill';
import { Timeline } from '../components/Timeline';
import { useVentaDetail } from '../hooks';
import { SALES_CURRENCY, describeLate } from '../sales';

/**
 * Detalle de una venta adjudicada (Épica 7, Módulo 7.5), en `/ventas-adjudicadas/:caseId`;
 * rediseño editorial. Arriba, la foto del lote con su estado y el precio final en grande;
 * a la izquierda, "El recorrido de la venta" (los 8 estados con su fecha y el próximo paso
 * donde está la venta, ver `SaleJourney`); a la derecha, comprador, operación, documentación,
 * observaciones y el lote; y abajo "Actividad" con lo más reciente primero. La lógica de
 * datos -- `useVentaDetail`, loading/error, `reload` tras cada mutación -- no cambió.
 */
export function VentaAdjudicadaDetailPage() {
  useTopNavLayout();
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

  const [now] = useState(() => Date.now());
  // Lo más reciente primero: el timeline viaja en orden cronológico y para saber qué pasó
  // último no hay que desplazarse hasta el final.
  const activity = useMemo(
    () => (data ? [...data.timeline].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()) : []),
    [data],
  );

  if (isLoading && !data) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-8 px-3 py-8 sm:px-6 lg:px-10">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="aspect-[16/6] w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
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

  const late = describeLate(data, now, data.timeline);
  const base = Number(data.base_price);
  const final = Number(data.final_price);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <Link
          to="/ventas-adjudicadas"
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Ventas adjudicadas
        </Link>

        <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
          <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-surface-subtle">
            <SaleCover url={data.lote_cover_image_url} className="h-full w-full" />
          </div>
          <div>
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
              <SaleStatusPill status={data.status} />
              {late && <LatePill text={late} />}
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl">{data.lote_title}</h1>
            <p className="mt-2.5 text-ink-muted">
              Lote {data.lot_number} · {data.remate_title}
            </p>
            <p className="mt-4 text-5xl font-semibold leading-none tracking-tighter tabular-nums sm:text-6xl">
              {formatCurrency(data.final_price, SALES_CURRENCY)}
            </p>
            <p className="mt-2 text-ink-muted">
              precio final
              {Number.isFinite(final - base) && final > base ? ` · ${formatCurrency(String(final - base), SALES_CURRENCY)} sobre el precio inicial` : ''}
              {data.buyer_name ? ` · ${data.buyer_name}` : ''}
            </p>
          </div>
        </header>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-12">
          <section aria-labelledby="journey-title">
            <h2 id="journey-title" className="mb-5 text-2xl font-semibold tracking-tight">
              El recorrido de la venta
            </h2>
            <SaleJourney data={data} late={late} onChanged={reload} />
          </section>

          <aside aria-label="Datos de la venta" className="flex flex-col gap-4">
            <BuyerCard data={data} />
            <OperationInfoCard data={data} />
            <DocumentationCard caseId={data.id} documents={data.documents} onChanged={reload} />
            <LastObservationCard data={data} onAdded={reload} />
            <LoteInfoCard data={data} />
          </aside>
        </div>

        <section id="actividad" aria-labelledby="activity-title" className="mt-14 scroll-mt-24">
          <h2 id="activity-title" className="mb-5 text-2xl font-semibold tracking-tight">
            Actividad
          </h2>
          <div className="max-w-3xl border-t border-ink pt-6">
            <Timeline entries={activity} />
          </div>
        </section>
      </div>
    </div>
  );
}
