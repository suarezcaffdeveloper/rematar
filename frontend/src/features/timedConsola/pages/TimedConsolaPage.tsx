import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Select } from '../../../shared/components/Select';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { AnalyticsPanel } from '../../analytics/components/AnalyticsPanel';
import { useRemateAnalytics } from '../../analytics/hooks';
import { useAuth } from '../../auth/hooks';
import { PrivateAccessPanel } from '../../rematador/components/PrivateAccessPanel';
import { BoxIcon } from '../../remates/components/icons';
import { STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { LoteCountdown } from '../../sala/components/LoteCountdown';
import { useTimedSalaState } from '../../timedSala/hooks';
import { TimedLoteDetailModal } from '../components/TimedLoteDetailModal';
import { LoteBoardCarousel } from '../components/LoteBoardCarousel';
import { TimedLoteBoardCard } from '../components/TimedLoteBoardCard';

type BoardSort = 'catalog' | 'offers' | 'price';

function TimedConsolaSkeleton() {
  return (
    <div className="flex flex-col gap-6 font-display">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Panel de la empresa dentro de un remate Timed (`/remates/:id/gestionar`). A diferencia de
 * la Consola LIVE (`ConsolaOperativaPage`: un lote activo, botonera del martillero, chat),
 * un Timed no se "opera" -- todos los lotes reciben ofertas en paralelo hasta que cierran
 * solos --, así que acá la empresa mira, no controla: arriba el estado global del remate
 * (tiempo restante, KPIs), después un tablero con TODOS los lotes (portada, precio actual,
 * ofertas, tiempo) y por último la analítica en tiempo real, sin chat ni presencia.
 *
 * Reusa `useTimedSalaState` (lotes + precios líderes por WebSocket, misma conexión que
 * alimenta la sala del comprador) y le cuelga la analítica por su `subscribeToRealtime`.
 */
export function TimedConsolaPage({ remateId }: { remateId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  useWideLayout();

  const { remate, lotes, leadingAmounts, offerActivityVersion, isLoading, error, reload, subscribeToRealtime } = useTimedSalaState(remateId);
  const isOwner = !!remate && user?.id === remate.owner_id;
  // El endpoint de analítica es owner-only (403 para el rematador operador): `remateId`
  // vacío hace que el hook no dispare ningún fetch.
  const { data: analytics } = useRemateAnalytics(isOwner ? remateId : '', subscribeToRealtime);

  const [sort, setSort] = useState<BoardSort>('catalog');
  const [selectedLote, setSelectedLote] = useState<Lote | null>(null);

  useBreadcrumb(
    remate ? [{ label: 'Mis remates', to: '/' }, { label: remate.title }] : [{ label: 'Mis remates', to: '/' }],
  );

  const offerCounts = useMemo(() => {
    if (!analytics) return null;
    return new Map(analytics.offers_by_lote.map((entry) => [entry.lote_id, entry.offer_count]));
  }, [analytics]);

  const currency = remate?.settings.currency ?? 'ARS';

  const priceOf = (lote: Lote): number =>
    Number(lote.status === 'closed_sold' ? (lote.final_price ?? lote.base_price) : (leadingAmounts[lote.id] ?? lote.base_price));

  const sortedLotes = useMemo(() => {
    if (sort === 'catalog') return lotes;
    const copy = [...lotes];
    if (sort === 'offers') {
      copy.sort((a, b) => (offerCounts?.get(b.id) ?? 0) - (offerCounts?.get(a.id) ?? 0));
    } else {
      copy.sort((a, b) => priceOf(b) - priceOf(a));
    }
    return copy;
  }, [lotes, sort, offerCounts, leadingAmounts]);

  if (isLoading) return <TimedConsolaSkeleton />;

  if (error || !remate) {
    return (
      <Alert variant="error">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{error?.message ?? 'No se pudo cargar el panel de este remate.'}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Volver al dashboard
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  const lotesWithBids = lotes.filter((lote) => lote.status === 'closed_sold' || leadingAmounts[lote.id] != null).length;
  // Suma de lo que hoy vale cada lote con al menos una oferta (líder o precio final).
  const potentialValue = lotes.reduce((sum, lote) => {
    const hasBid = lote.status === 'closed_sold' || leadingAmounts[lote.id] != null;
    return hasBid ? sum + priceOf(lote) : sum;
  }, 0);

  const isActive = remate.status === 'live' || remate.status === 'paused';
  // Credenciales de acceso que la empresa comparte con COMPRADORES de un remate privado.
  // Un Timed no tiene operador en vivo, así que no existe el panel "Datos para el
  // martillero" de la consola LIVE.
  const showPrivateAccessPanel =
    isOwner && remate.access_type === 'private' && remate.status !== 'finished' && remate.status !== 'cancelled';

  const stats = [
    { label: 'Lotes con ofertas', value: `${lotesWithBids} de ${lotes.length}` },
    { label: 'Valor acumulado', value: formatCurrency(String(potentialValue), currency) },
    { label: 'Total de ofertas', value: analytics ? String(analytics.total_ofertas) : '—' },
    { label: 'Compradores conectados', value: analytics ? String(analytics.connected_buyers) : '—' },
  ];

  return (
    <div className="flex flex-col gap-8 font-display">
      {showPrivateAccessPanel && <PrivateAccessPanel remate={remate} />}

      {/* Cabecera abierta, sin card: el tablero de lotes es lo que tiene que destacar. */}
      <header className="flex flex-col gap-6 border-b border-line pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              <span>Timed Auction</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={clsx('h-1.5 w-1.5 rounded-full', isActive ? 'bg-success-500' : 'bg-slate-300')}
                />
                {STATUS_LABELS[remate.status]}
              </span>
            </div>
            <h1 className="truncate text-3xl font-bold tracking-tight text-ink">{remate.title}</h1>
            {remate.starts_at && remate.ends_at && (
              <p className="text-sm text-ink-faint">
                {formatDateTime(remate.starts_at)} → {formatDateTime(remate.ends_at)}
              </p>
            )}
          </div>
          {isActive && remate.ends_at && (
            <div className="flex items-baseline gap-3 lg:justify-end">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Cierre del remate</span>
              <LoteCountdown variant="inline" size="md" endsAt={remate.ends_at} pausedRemainingSeconds={null} />
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-y-4 lg:grid-cols-4 lg:divide-x lg:divide-line">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-0.5 lg:px-6 lg:first:pl-0">
              <dt className="text-xs text-ink-faint">{stat.label}</dt>
              <dd className="text-xl font-semibold tabular-nums text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="flex flex-col gap-4" aria-label="Lotes del remate">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Lotes <span className="font-normal text-ink-faint">({lotes.length})</span></h2>
          {isOwner && (
            <div className="w-48">
              <Select label="Ordenar por" value={sort} onChange={(event) => setSort(event.target.value as BoardSort)}>
                <option value="catalog">Orden del catálogo</option>
                <option value="offers">Más ofertas</option>
                <option value="price">Mayor precio</option>
              </Select>
            </div>
          )}
        </div>

        {lotes.length === 0 ? (
          <EmptyState
            icon={<BoxIcon className="h-10 w-10" />}
            title="Este remate todavía no tiene lotes"
            description="Agregá lotes desde la gestión de lotes para verlos acá."
            action={
              <Button variant="secondary" onClick={() => navigate(`/remates/${remate.id}/lotes`)}>
                Gestionar lotes
              </Button>
            }
          />
        ) : (
          <LoteBoardCarousel label="Lotes del remate" resetKey={sort}>
            {sortedLotes.map((lote) => (
              <TimedLoteBoardCard
                key={lote.id}
                lote={lote}
                currency={currency}
                leadingAmount={leadingAmounts[lote.id]}
                offerCount={offerCounts ? (offerCounts.get(lote.id) ?? 0) : null}
                onSelect={setSelectedLote}
              />
            ))}
          </LoteBoardCarousel>
        )}
      </section>

      {isOwner && <AnalyticsPanel remateId={remate.id} subscribeToRealtime={subscribeToRealtime} currency={currency} />}

      {selectedLote && (
        <TimedLoteDetailModal
          remateId={remate.id}
          lote={lotes.find((lote) => lote.id === selectedLote.id) ?? selectedLote}
          currency={currency}
          leadingAmount={leadingAmounts[selectedLote.id] ?? null}
          offerActivityVersion={offerActivityVersion[selectedLote.id] ?? 0}
          onClose={() => setSelectedLote(null)}
        />
      )}
    </div>
  );
}
