import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFocusMode } from '../../../app/layouts/useFocusMode';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useAuth } from '../../auth/hooks';
import type { GarantiaStatus } from '../../garantias/types';
import { GavelIcon, SearchIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS } from '../../remates/labels';
import { LoteQueueList } from '../components/LoteQueueList';
import { TimedLoteBidRail } from '../components/TimedLoteBidRail';
import { TimedLoteCenterPanel } from '../components/TimedLoteCenterPanel';
import { TimedLoteHistoryCard } from '../components/TimedLoteHistoryCard';
import { useTimedSalaState } from '../hooks';

function TimedSalaSkeleton() {
  return (
    <div className="flex w-full flex-col gap-8 font-display xl:flex-row xl:items-start xl:gap-10">
      <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[320px]">
        <Skeleton className="h-7 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full shrink-0 rounded-xl" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Skeleton className="h-6 w-2/3 rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="aspect-video w-full rounded-xl" />
          </div>
          <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Sala de un Timed Auction -- a diferencia de la sala LIVE (`SalaPage`, "el lote
 * activo" del rematador), acá conviven varios lotes `open` a la vez, cada uno con su
 * propio timer, y el comprador entra y oferta en el que quiera. Distribución (pedido
 * explícito, match del mockup de referencia): columna izquierda angosta y fija --
 * título/descripción del remate, buscador (también filtra por categoría, sin chips
 * aparte -- pedido explícito) y el carrusel de lotes (`LoteQueueList`, scroll propio,
 * `sticky` respecto del scroll de la página) -- y a la derecha una sola columna que
 * fluye con el scroll real de la página: identidad + galería del lote fijado
 * (`TimedLoteCenterPanel`) junto al panel de puja (`TimedLoteBidRail`), y debajo, a
 * ancho completo, el historial de ofertas (`TimedLoteHistoryCard`).
 *
 * Sin `max-w` propio (pedido explícito, "mucho margen blanco"): `AppLayout` ya le da a
 * esta página `max-w-[110rem]` + `lg:pl-16` (el riel del Sidebar) vía `useFocusMode`,
 * que alcanza como margen respecto de la navegación global -- un segundo `max-w`
 * angosto acá adentro solo duplicaba el recorte y dejaba franjas vacías a los costados.
 *
 * Montada desde `SalaPage` una vez que se conoce `remate.auction_type === 'timed'` (ver
 * `SalaPage.tsx`) -- no tiene su propia ruta en `app/router.tsx`, así que la URL sigue
 * siendo la misma `/remates/:remateId/sala` para las dos modalidades.
 */
export function TimedSalaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  useWideLayout();
  useFocusMode(true);

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

  const [searchQuery, setSearchQuery] = useState('');

  // Buscador del carrusel (pedido explícito, "por si hay muchos lotes") -- filtra por
  // número, título O categoría (sin chips aparte -- si querés filtrar por categoría,
  // escribís su nombre acá; con dos filtros separados conviviendo era redundante).
  // Sin distinguir mayúsculas/acentos exactos (alcanza con minúsculas simple, los
  // títulos que carga un rematador rara vez llevan tildes en mayúscula que rompan una
  // comparación así). El carrusel y el panel derecho SIEMPRE muestran la misma lista
  // (`searchedLotes`, no `visibleLotes`) -- si mostraran listas distintas, el lote
  // "activo" resaltado en el carrusel podría no ser el mismo que el panel de la
  // derecha, apenas la búsqueda dejara afuera al fijado.
  const searchedLotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return visibleLotes;
    return visibleLotes.filter(
      (lote) =>
        lote.title.toLowerCase().includes(query) ||
        lote.lot_number.toLowerCase().includes(query) ||
        CATEGORY_LABELS[lote.category].toLowerCase().includes(query),
    );
  }, [visibleLotes, searchQuery]);

  const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);
  // Garantía económica (bloqueo de tarjeta vía Mercado Pago) -- mismo criterio que
  // `SalaPage` (Sala LIVE): `null` mientras `GarantiaGate` no resolvió el estado
  // inicial, tratado igual que "sin garantía activa" hasta que sí lo haga.
  const [garantiaStatus, setGarantiaStatus] = useState<GarantiaStatus | null>(null);

  // Selecciona un lote por default (preferentemente uno `open`) y se recupera si el
  // lote fijado deja de estar en la lista buscada -- ya sea porque se canceló o porque
  // una búsqueda nueva lo dejó afuera -- sin este efecto, la pantalla quedaría mostrando
  // el panel derecho de un lote que el carrusel ya no tiene a la vista.
  useEffect(() => {
    if (searchedLotes.length === 0) {
      setSelectedLoteId(null);
      return;
    }
    setSelectedLoteId((current) => {
      if (current !== null && searchedLotes.some((lote) => lote.id === current)) return current;
      return searchedLotes.find((lote) => lote.status === 'open')?.id ?? searchedLotes[0].id;
    });
  }, [searchedLotes]);

  if (isLoading) {
    return <TimedSalaSkeleton />;
  }

  if (error || !remate) {
    return (
      <div className="flex w-full flex-col gap-6 font-display">
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
      <div className="flex w-full flex-col gap-6 font-display">
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Todavía no hay lotes cargados"
          description="Este remate Timed no tiene lotes para mostrar por el momento."
        />
      </div>
    );
  }

  const currency = remate.settings.currency;
  const selectedLote = searchedLotes.find((lote) => lote.id === selectedLoteId) ?? null;
  const isLeadingBidder =
    user !== null && selectedLote !== null && leadingBuyerIds[selectedLote.id] === user.id;
  const guaranteeRequired = Boolean(remate.settings.guarantee_required);
  const guaranteeAmount = remate.settings.guarantee_amount;
  const showGarantiaGate = guaranteeRequired && user?.role === 'comprador';
  const hasRequiredGuarantee = !guaranteeRequired || garantiaStatus === 'active';

  return (
    <div className="flex w-full flex-col gap-8 font-display xl:flex-row xl:items-start xl:gap-10">
      {/* Izquierda: fija, con scroll propio -- título/descripción del remate, buscador
       * y el carrusel de lotes. */}
      <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[320px] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:overflow-x-hidden">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{remate.title}</h1>
          {remate.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{remate.description}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Secuencia de lotes · {searchedLotes.length}
          </p>

          {visibleLotes.length > 1 && (
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <SearchIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por número, título o categoría…"
                aria-label="Buscar lote por número, título o categoría"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </div>
          )}

          {searchedLotes.length > 0 ? (
            <LoteQueueList
              lotes={searchedLotes}
              selectedLoteId={selectedLoteId ?? ''}
              onSelect={setSelectedLoteId}
              leadingAmounts={leadingAmounts}
              currency={currency}
            />
          ) : (
            <p className="text-center text-sm text-ink-faint">Ningún lote coincide con "{searchQuery}".</p>
          )}
        </div>
      </div>

      {/* Línea minimalista entre las dos mitades de la pantalla (pedido explícito). */}
      <div aria-hidden="true" className="hidden self-stretch xl:block xl:w-px xl:bg-line" />

      {/* Derecha: única columna, fluye con el scroll real de la página. */}
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        {selectedLote ? (
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-8">
            <div className="min-w-0 flex-1">
              <TimedLoteCenterPanel key={selectedLote.id} lote={selectedLote} />
            </div>

            <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[340px]">
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
                showGarantiaGate={showGarantiaGate && guaranteeAmount !== null && guaranteeAmount !== undefined}
                guaranteeAmount={guaranteeAmount ?? null}
                onGarantiaStatusChange={setGarantiaStatus}
              />

              {/* Ofertas recientes debajo de la card de ofertar (pedido explícito). */}
              <TimedLoteHistoryCard
                key={`history-${selectedLote.id}`}
                remateId={remate.id}
                loteId={selectedLote.id}
                offerActivityVersion={offerActivityVersion[selectedLote.id] ?? 0}
                currency={currency}
                currentUserId={user?.id ?? null}
              />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<SearchIcon className="h-10 w-10" />}
            title="Ningún lote coincide con tu búsqueda"
            description="Probá con otro número o título de lote."
          />
        )}
      </div>
    </div>
  );
}
