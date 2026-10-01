import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { useAuth } from '../../auth/hooks';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { fetchLeadingOfferAmountRequest } from '../api';
import { LoteGallery } from '../components/ficha/LoteGallery';
import { RemateFacts } from '../components/ficha/RemateFacts';
import { RemateHero } from '../components/ficha/RemateHero';
import { GavelIcon } from '../components/icons';
import { RemateNotLiveDialog } from '../components/RemateNotLiveDialog';
import { useLotes, useRemateDetail } from '../hooks';

const LOTE_SKELETON_COUNT = 4;

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-center lg:gap-16">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-16 w-full max-w-xl" />
          <Skeleton className="h-12 w-44 rounded-full" />
        </div>
        <Skeleton className="h-[22rem] w-full rounded-2xl sm:h-[26rem]" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Página de detalle de un remate (Épica 4, Módulo 4.4) -- lo que el comprador ve antes
 * de "entrar" a la sala en vivo. Dos fuentes de datos independientes, cada una con su
 * propio estado de carga/error (`useRemateDetail`, `useLotes`): un fallo al traer los
 * lotes no debería tirar abajo la información del remate que sí cargó bien, y viceversa.
 *
 * Rediseño "mosaico" (mismo lenguaje visual que el inicio y "Mis compras"): `RemateHero`
 * (título, estado y botón para entrar, con un mosaico de fotos), `RemateFacts` (cuándo,
 * tipo, dónde y garantía como cifras grandes), la descripción y `LoteGallery` (los lotes
 * como galería, con filtro por estado y visor de fotos). `useTopNavLayout()` le pide a
 * `AppLayout` la barra superior `BuyerTopNav` en lugar de `Sidebar` + `Header`; sin el
 * `Header` ya no hay breadcrumb a la vista, por eso el link para volver.
 *
 * El botón "Iniciar sesión" en el error solo aparece sin sesión (`!isAuthenticated`) --
 * mismo trato para CUALQUIER 404 anónimo, sin distinguir "no existe" de "es privado y
 * hace falta sesión" (mismo criterio anti-enumeración que ya aplica el backend). Cubre
 * al comprador que ya tiene `RemateAccessGrant` para un remate privado pero perdió la
 * sesión (logout, refresh token vencido): sin este botón, no había ninguna pista de que
 * loguearse de nuevo alcanzaría para recuperar el acceso sin re-tipear el código (ver
 * también `RedeemPrivateAccessPage`, que le muestra sus remates ya canjeados).
 */
export function RemateDetailPage() {
  useTopNavLayout();
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isNotLiveDialogOpen, setIsNotLiveDialogOpen] = useState(false);

  const {
    remate,
    isLoading: isRemateLoading,
    error: remateError,
    reload: reloadRemate,
  } = useRemateDetail(remateId ?? '');
  const { lotes, isLoading: isLotesLoading, error: lotesError, reload: reloadLotes } = useLotes(remateId ?? '');

  // En un remate TIMED, cada lote abierto muestra el precio que va liderando -- una
  // llamada `GET .../ofertas/leading` por lote `open`, best-effort y en paralelo (mismo
  // patrón que `useTimedSalaState`): si falla una, ese lote simplemente muestra el
  // precio base. Sin WebSocket en esta pantalla -- el precio queda congelado hasta la
  // próxima recarga (decisión explícita; la sala Timed sí lo mantiene vivo por eventos).
  const [leadingAmounts, setLeadingAmounts] = useState<Record<string, string | null>>({});
  const isTimed = (remate?.auction_type ?? 'live') === 'timed';

  useEffect(() => {
    if (!isTimed || !remateId) return;
    const openLotes = lotes.filter((lote) => lote.status === 'open');
    if (openLotes.length === 0) return;

    let cancelled = false;
    void Promise.all(
      openLotes.map(async (lote) => {
        try {
          const amount = await fetchLeadingOfferAmountRequest(remateId, lote.id);
          return [lote.id, amount] as const;
        } catch {
          return [lote.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setLeadingAmounts((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [isTimed, remateId, lotes]);

  const items: BreadcrumbItem[] = isRemateLoading
    ? []
    : remateError || !remate
      ? [{ label: 'Dashboard', to: '/' }, { label: 'Remate no encontrado' }]
      : [{ label: 'Dashboard', to: '/' }, { label: remate.title }];
  useBreadcrumb(items);

  const backTo = isAuthenticated ? '/' : '/remates';
  const backLink = (
    <Link
      to={backTo}
      className="group mb-6 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
      Remates
    </Link>
  );

  function renderBody() {
    if (isRemateLoading) return <DetailSkeleton />;

    if (remateError || !remate) {
      return (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{remateError?.message ?? 'No se pudo cargar este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reloadRemate}>
                Reintentar
              </Button>
              {!isAuthenticated && (
                <Button variant="secondary" onClick={() => navigate('/login')}>
                  Iniciar sesión
                </Button>
              )}
              <Button variant="secondary" onClick={() => navigate('/')}>
                Volver al dashboard
              </Button>
            </div>
          </div>
        </Alert>
      );
    }

    // `paused` entra igual que `live`: la Sala ya sabe mostrar ese estado (mismo criterio
    // que `SalaHeader`), no hace falta interceptarlo acá. `finished`/`cancelled` tampoco
    // se interceptan -- son remates que ya pasaron, no "todavía no en vivo", y la Sala ya
    // tiene su propio manejo para ese caso (ver `SalaPage`).
    const isNotYetLive = remate.status === 'draft' || remate.status === 'scheduled';
    const handleEnter = () => {
      if (isNotYetLive) {
        setIsNotLiveDialogOpen(true);
        return;
      }
      navigate(`/remates/${remate.id}/sala`);
    };
    const showGallery = !isLotesLoading && !lotesError && lotes.length > 0;

    return (
      <>
        <RemateHero remate={remate} lotes={lotes} onEnter={handleEnter} />
        <RemateFacts remate={remate} />

        <section aria-labelledby="sobre-title" className="mt-16 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
          <h2 id="sobre-title" className="text-2xl font-semibold tracking-tight">
            Sobre este remate
          </h2>
          <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-ink-muted">
            {remate.description ?? 'Este remate todavía no tiene una descripción cargada.'}
          </p>
        </section>

        {showGallery ? (
          <LoteGallery
            lotes={lotes}
            currency={remate.settings.currency}
            auctionType={remate.auction_type ?? 'live'}
            leadingAmounts={leadingAmounts}
          />
        ) : (
          <section aria-labelledby="lotes-title" className="mt-20 pb-20">
            <h2 id="lotes-title" className="text-2xl font-semibold tracking-tight">
              Lotes de este remate
            </h2>
            <p className="mb-6 mt-1 text-ink-muted">Explorá y seleccioná tus lotes de interés antes del inicio.</p>

            {lotesError && (
              <Alert variant="error">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{lotesError.message}</span>
                  <Button variant="secondary" onClick={reloadLotes}>
                    Reintentar
                  </Button>
                </div>
              </Alert>
            )}

            {isLotesLoading && !lotesError && (
              <div className="grid auto-rows-[15rem] grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: LOTE_SKELETON_COUNT }, (_, index) => (
                  <Skeleton key={index} className="h-full w-full rounded-2xl" />
                ))}
              </div>
            )}

            {!isLotesLoading && !lotesError && lotes.length === 0 && (
              <EmptyState
                icon={<GavelIcon className="h-10 w-10" />}
                title="Este remate todavía no tiene lotes cargados"
                description="Cuando el martillero cargue lotes, van a aparecer acá."
              />
            )}
          </section>
        )}

        <RemateNotLiveDialog
          isOpen={isNotLiveDialogOpen}
          onClose={() => setIsNotLiveDialogOpen(false)}
          startsAt={remate.starts_at}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        {backLink}
        {renderBody()}
      </div>
    </div>
  );
}
