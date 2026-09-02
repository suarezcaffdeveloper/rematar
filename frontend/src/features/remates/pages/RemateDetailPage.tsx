import { useNavigate, useParams } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useAuth } from '../../auth/hooks';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../components/icons';
import { LoteCard } from '../components/LoteCard';
import { LoteCardSkeleton } from '../components/LoteCardSkeleton';
import { RemateDetailOverview } from '../components/RemateDetailOverview';
import { useLotes, useRemateDetail } from '../hooks';

const LOTE_SKELETON_COUNT = 3;

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="aspect-[4/3] w-full rounded-2xl sm:aspect-[21/9]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_35%]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Página de detalle de un remate (Épica 4, Módulo 4.4) -- lo que el comprador ve antes
 * de "entrar" a la sala en vivo. Dos fuentes de datos independientes, cada una con su
 * propio estado de carga/error (`useRemateDetail`, `useLotes`): un fallo al traer los
 * lotes no debería tirar abajo la información del remate que sí cargó bien, y viceversa.
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
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const {
    remate,
    isLoading: isRemateLoading,
    error: remateError,
    reload: reloadRemate,
  } = useRemateDetail(remateId ?? '');
  const { lotes, isLoading: isLotesLoading, error: lotesError, reload: reloadLotes } = useLotes(remateId ?? '');

  const items: BreadcrumbItem[] = isRemateLoading
    ? []
    : remateError || !remate
      ? [{ label: 'Dashboard', to: '/' }, { label: 'Remate no encontrado' }]
      : [{ label: 'Dashboard', to: '/' }, { label: remate.title }];
  useBreadcrumb(items);

  if (isRemateLoading) {
    return (
      <div className="flex flex-col gap-6 font-display">
        <Skeleton className="h-4 w-48" />
        <DetailSkeleton />
      </div>
    );
  }

  if (remateError || !remate) {
    return (
      <div className="flex flex-col gap-6 font-display">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 font-display">
      <RemateDetailOverview
        remate={remate}
        lotes={lotes}
        onEnterRoom={() => navigate(`/remates/${remate.id}/sala`)}
      />

      <div className="flex flex-col gap-4 border-t border-line pt-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Lotes de este remate</h2>
          <p className="text-sm text-ink-muted">Explorá y seleccioná tus lotes de interés antes del inicio.</p>
        </div>

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
          <div className="flex flex-col gap-4">
            {Array.from({ length: LOTE_SKELETON_COUNT }, (_, index) => (
              <LoteCardSkeleton key={index} />
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

        {!isLotesLoading && !lotesError && lotes.length > 0 && (
          <div className="flex flex-col gap-4">
            {lotes.map((lote) => (
              <LoteCard key={lote.id} lote={lote} currency={remate.settings.currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
