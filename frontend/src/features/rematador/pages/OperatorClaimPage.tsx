import { useNavigate } from 'react-router-dom';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useAuth } from '../../auth/hooks';
import { claimOperatorRequest } from '../../remates/api';
import { useRemates } from '../../remates/hooks';
import type { Remate } from '../../remates/types';
import { CurrentAssignment } from '../components/CurrentAssignment';
import { OperatedRemates } from '../components/OperatedRemates';
import { OperatorClaimForm } from '../components/OperatorClaimForm';
import { OperatorClaimHowTo } from '../components/OperatorClaimHowTo';

// `Remate.rematador_id` no se limpia solo al terminar/cancelarse (ver
// `RemateService.claim_operator`, "un rematador solo puede operar un remate a la vez")
// -- así que `GET /remates?rematador_id=<mi_id>` puede devolver remates viejos ya
// cerrados. Estos son los únicos estados que cuentan como "lo que tengo asignado ahora".
const ACTIVE_ASSIGNMENT_STATUSES = new Set<Remate['status']>(['draft', 'scheduled', 'live', 'paused']);

function sortByEndDesc(a: Remate, b: Remate): number {
  const dateA = a.finished_at ?? a.starts_at ?? a.created_at;
  const dateB = b.finished_at ?? b.starts_at ?? b.created_at;
  return new Date(dateB).getTime() - new Date(dateA).getTime();
}

function ClaimSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full max-w-xl rounded-2xl" />
        <Skeleton className="h-5 w-full max-w-md rounded-md" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}

/**
 * Pantalla de inicio del rol `rematador` acotado (ADR-047/ADR-048): a diferencia de
 * `RematadorDashboardPage` (exclusiva de `empresa`, que sí es dueña de remates), un usuario
 * `rematador` no tiene remates propios.
 *
 * Mismo lenguaje visual que "Ingresar a remate privado" del comprador: `useTopNavLayout()`
 * le pide a `AppLayout` la barra superior `BuyerTopNav` en lugar de `Sidebar` + `Header`,
 * título grande, formulario paso a paso (`OperatorClaimForm`) con los tres pasos
 * explicativos al costado (`OperatorClaimHowTo`) y, debajo, los remates finalizados que ya
 * dirigió (`OperatedRemates`).
 *
 * Antes de mostrar el formulario de canje se consulta `GET /remates?rematador_id=<mi_id>`
 * (`useRemates`, mismo hook que usa `CompradorDashboardPage`) -- como un rematador solo puede
 * operar un remate a la vez (`RemateService.claim_operator`), alcanza con encontrar el primero
 * en un estado no terminal para saber si ya está asignado. Si lo está, `CurrentAssignment`
 * reemplaza por completo al formulario -- no tiene sentido pedirle un código nuevo a alguien
 * que ya tiene uno vigente. Si el fetch falla, se degrada al formulario de siempre (sin
 * historial) en vez de bloquear la pantalla: canjear un código no depende de este chequeo.
 */
export function OperatorClaimPage() {
  useTopNavLayout();
  const { user } = useAuth();
  const { remates, isLoading, error } = useRemates({ rematadorId: user?.id });
  const navigate = useNavigate();

  async function handleClaim(remateId: string, code: string) {
    const remate = await claimOperatorRequest(remateId, code);
    navigate(`/remates/${remate.id}/gestionar`);
  }

  const currentAssignment = error
    ? null
    : (remates.find((remate) => ACTIVE_ASSIGNMENT_STATUSES.has(remate.status)) ?? null);
  const operated = error ? [] : remates.filter((remate) => remate.status === 'finished').sort(sortByEndDesc);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        {isLoading ? (
          <ClaimSkeleton />
        ) : (
          <>
            <header className="mb-12">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                {currentAssignment ? 'Tu remate de hoy' : 'Unirme como operador'}
              </h1>
              <p className="mt-5 max-w-md text-ink-muted">
                {currentAssignment
                  ? 'Ya estás asignado como operador. Volvé a la consola cuando quieras.'
                  : 'Ingresá el ID del remate y el código de operador que te compartió la empresa organizadora.'}
              </p>
            </header>

            {currentAssignment ? (
              <CurrentAssignment remate={currentAssignment} />
            ) : (
              <div className="grid gap-16 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-24">
                <OperatorClaimHowTo />
                <OperatorClaimForm onClaim={handleClaim} />
              </div>
            )}

            {operated.length > 0 && <OperatedRemates remates={operated} />}
          </>
        )}
      </div>
    </div>
  );
}
