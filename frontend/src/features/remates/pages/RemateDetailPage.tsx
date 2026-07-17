import { useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../components/icons';
import { LoteCard } from '../components/LoteCard';
import { LoteCardSkeleton } from '../components/LoteCardSkeleton';
import { RemateDetailHeader } from '../components/RemateDetailHeader';
import { RemateInfoSection } from '../components/RemateInfoSection';
import { useLotes, useRemateDetail } from '../hooks';

const LOTE_SKELETON_COUNT = 3;

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Skeleton className="aspect-[16/9] w-full rounded-none sm:aspect-[3/1]" />
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-40 lg:col-span-2" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

/**
 * Página de detalle de un remate (Épica 4, Módulo 4.4) -- lo que el comprador ve antes
 * de "entrar" a la sala en vivo. Dos fuentes de datos independientes, cada una con su
 * propio estado de carga/error (`useRemateDetail`, `useLotes`): un fallo al traer los
 * lotes no debería tirar abajo la información del remate que sí cargó bien, y viceversa.
 */
export function RemateDetailPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();

  const {
    remate,
    isLoading: isRemateLoading,
    error: remateError,
    reload: reloadRemate,
  } = useRemateDetail(remateId ?? '');
  const { lotes, total: loteTotal, isLoading: isLotesLoading, error: lotesError, reload: reloadLotes } =
    useLotes(remateId ?? '');

  if (isRemateLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <DetailSkeleton />
      </div>
    );
  }

  if (remateError || !remate) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Remate no encontrado' }]} />
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{remateError?.message ?? 'No se pudo cargar este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reloadRemate}>
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

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: remate.title }]} />

      <RemateDetailHeader remate={remate} onEnterRoom={() => navigate(`/remates/${remate.id}/sala`)} />

      <RemateInfoSection remate={remate} loteTotal={loteTotal} />

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Lotes de este remate</h2>

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
            description="Cuando el rematador cargue lotes, van a aparecer acá."
          />
        )}

        {!isLotesLoading && !lotesError && lotes.length > 0 && (
          <div className="flex flex-col gap-4">
            {lotes.map((lote) => (
              <LoteCard key={lote.id} lote={lote} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
