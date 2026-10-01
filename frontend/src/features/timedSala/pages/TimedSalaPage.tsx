import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useAuth } from '../../auth/hooks';
import { GarantiaModal } from '../../garantias/components/GarantiaModal';
import { useGarantiaStatus } from '../../garantias/hooks';
import { GavelIcon } from '../../remates/components/icons';
import { TimedLoteBidRail } from '../components/TimedLoteBidRail';
import { TimedLoteCatalog } from '../components/TimedLoteCatalog';
import { TimedLoteHistoryCard } from '../components/TimedLoteHistoryCard';
import { TimedLoteShowcase } from '../components/TimedLoteShowcase';
import { TimedSalaHeader } from '../components/TimedSalaHeader';
import { useTimedSalaState } from '../hooks';

const PAGE_CONTAINER = 'mx-auto w-full max-w-[110rem] px-4 font-display sm:px-6 lg:px-10';

function TimedSalaSkeleton() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="flex items-center gap-4 py-4">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-72 rounded-md" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 border-t border-line pt-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(26rem,0.7fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-9 w-2/3 rounded-md" />
          <Skeleton className="aspect-[16/11] w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-2/3 rounded-md" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Sala de un Timed Auction -- a diferencia de la sala LIVE (`SalaPage`, "el lote activo"
 * del rematador), acá conviven varios lotes `open` a la vez, cada uno con su propio
 * cierre, y el comprador entra y oferta en el que quiera. Distribución "vidriera":
 *
 * - Arriba, la vitrina con el lote elegido: título, fotos y descripción a la izquierda
 *   (`TimedLoteShowcase`); a la derecha, pegada al scroll, la mesa de ofertas -- cuenta
 *   regresiva, precio y formulario (`TimedLoteBidRail`) y las ofertas recientes
 *   (`TimedLoteHistoryCard`).
 * - Debajo, a todo el ancho, el catálogo con todos los lotes (`TimedLoteCatalog`), con
 *   buscador, filtros y orden; tocar uno lo sube a la vitrina.
 *
 * Los filtros del catálogo nunca cambian qué lote se ve arriba: solo elegir uno lo hace.
 *
 * La barra de navegación superior, fija al principio de la página, la pide `SalaPage`
 * (que monta esta página una vez que conoce la modalidad) junto con el ancho amplio y el
 * modo foco -- no tiene su propia ruta en `app/router.tsx`, así que la URL sigue siendo la
 * misma `/remates/:remateId/sala` para las dos modalidades.
 */
export function TimedSalaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    remate,
    lotes,
    leadingAmounts,
    leadingBuyerIds,
    offerActivityVersion,
    isLoading,
    error,
    reload,
  } = useTimedSalaState(remateId ?? '');

  const visibleLotes = useMemo(() => lotes.filter((lote) => lote.status !== 'cancelled'), [lotes]);

  const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);
  // Garantía económica (bloqueo de tarjeta vía Mercado Pago) -- mismo criterio que
  // `SalaPage` (Sala LIVE): `useGarantiaStatus` resuelve el estado y el diálogo para
  // constituirla lo abre el botón "Construir garantía" del propio `PlaceBidButton`.
  // `null` mientras el fetch inicial no resolvió, tratado igual que "sin garantía activa"
  // hasta que sí lo haga.
  const [isGarantiaModalOpen, setIsGarantiaModalOpen] = useState(false);
  const { status: garantiaStatus, reportGarantia } = useGarantiaStatus(remateId ?? '');

  // Elige un lote por default (preferentemente uno `open`) y se recupera si el lote
  // elegido deja de estar (por ejemplo, se canceló).
  useEffect(() => {
    if (visibleLotes.length === 0) {
      setSelectedLoteId(null);
      return;
    }
    setSelectedLoteId((current) => {
      if (current !== null && visibleLotes.some((lote) => lote.id === current)) return current;
      return visibleLotes.find((lote) => lote.status === 'open')?.id ?? visibleLotes[0].id;
    });
  }, [visibleLotes]);

  if (isLoading) {
    return <TimedSalaSkeleton />;
  }

  if (error || !remate) {
    return (
      <div className={`${PAGE_CONTAINER} py-6`}>
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error?.message ?? 'No se pudo cargar este remate.'}</span>
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
      </div>
    );
  }

  if (visibleLotes.length === 0) {
    return (
      <div className={`${PAGE_CONTAINER} py-6`}>
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Todavía no hay lotes cargados"
          description="Este remate Timed no tiene lotes para mostrar por el momento."
        />
      </div>
    );
  }

  const currency = remate.settings.currency;
  const selectedLote = visibleLotes.find((lote) => lote.id === selectedLoteId) ?? null;
  const isLeadingBidder =
    user !== null && selectedLote !== null && leadingBuyerIds[selectedLote.id] === user.id;
  const guaranteeRequired = Boolean(remate.settings.guarantee_required);
  const guaranteeAmount = remate.settings.guarantee_amount;
  const isGarantiaGateRelevant = guaranteeRequired && user?.role === 'comprador';
  const hasRequiredGuarantee = !guaranteeRequired || garantiaStatus === 'active';
  const openCount = visibleLotes.filter((lote) => lote.status === 'open').length;

  // Tocar un lote del catálogo (que queda abajo) lo sube a la vitrina.
  const handleSelectLote = (loteId: string) => {
    setSelectedLoteId(loteId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={PAGE_CONTAINER}>
      {/* Diálogo de la garantía, montado una sola vez por la página y abierto desde el
       * botón "Construir garantía" del `PlaceBidButton` (mismo criterio que la Sala LIVE). */}
      {isGarantiaGateRelevant && guaranteeAmount !== null && guaranteeAmount !== undefined && (
        <GarantiaModal
          isOpen={isGarantiaModalOpen}
          onClose={() => setIsGarantiaModalOpen(false)}
          remateId={remate.id}
          amount={guaranteeAmount}
          currency={currency}
          onResolved={reportGarantia}
        />
      )}

      <TimedSalaHeader remate={remate} openCount={openCount} totalCount={visibleLotes.length} />

      {selectedLote && (
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 border-t border-line pt-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(26rem,0.7fr)]">
          <TimedLoteShowcase key={selectedLote.id} lote={selectedLote} currency={currency} />

          <section aria-label="Mesa de ofertas" className="min-w-0 xl:border-l xl:border-line xl:pl-10">
            <div className="flex flex-col gap-5 xl:sticky xl:top-4">
              <TimedLoteBidRail
                key={selectedLote.id}
                lote={selectedLote}
                currency={currency}
                leadingAmount={leadingAmounts[selectedLote.id] ?? null}
                remateId={remate.id}
                remateStatus={remate.status}
                viewerRole={user?.role}
                isLeadingBidder={isLeadingBidder}
                hasRequiredGuarantee={hasRequiredGuarantee}
                onBuildGuarantee={
                  isGarantiaGateRelevant && guaranteeAmount !== null && guaranteeAmount !== undefined
                    ? () => setIsGarantiaModalOpen(true)
                    : undefined
                }
              />
              <TimedLoteHistoryCard
                key={`history-${selectedLote.id}`}
                remateId={remate.id}
                loteId={selectedLote.id}
                offerActivityVersion={offerActivityVersion[selectedLote.id] ?? 0}
                currency={currency}
                currentUserId={user?.id ?? null}
              />
            </div>
          </section>
        </div>
      )}

      <TimedLoteCatalog
        lotes={visibleLotes}
        selectedLoteId={selectedLoteId}
        onSelect={handleSelectLote}
        leadingAmounts={leadingAmounts}
        leadingBuyerIds={leadingBuyerIds}
        currentUserId={user?.id ?? null}
        currency={currency}
      />
    </div>
  );
}
