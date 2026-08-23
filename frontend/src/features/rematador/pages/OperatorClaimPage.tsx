import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { Input } from '../../../shared/components/Input';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { useAuth } from '../../auth/hooks';
import { claimOperatorRequest } from '../../remates/api';
import { useRemates } from '../../remates/hooks';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';

// `Remate.rematador_id` no se limpia solo al terminar/cancelarse (ver
// `RemateService.claim_operator`, "un rematador solo puede operar un remate a la vez")
// -- así que `GET /remates?rematador_id=<mi_id>` puede devolver remates viejos ya
// cerrados. Estos son los únicos estados que cuentan como "lo que tengo asignado ahora".
const ACTIVE_ASSIGNMENT_STATUSES = new Set<Remate['status']>(['draft', 'scheduled', 'live', 'paused']);

function ClaimSkeleton() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

interface CurrentAssignmentCardProps {
  remate: Remate;
}

/**
 * Lo primero que ve un rematador con un remate ya asignado -- resuelve el caso de
 * "salió sin querer de la consola operativa": antes, `OperatorClaimPage` siempre pedía
 * de nuevo el ID + código, así que la empresa tenía que regenerar y volver a compartir
 * los dos aunque el rematador siguiera siendo el operador asignado (`claim_operator`
 * solo revoca al canjear un código nuevo, no por perder la pestaña). Panel "mi remate
 * actual" (Fase 1, ver definición de la mejora del rol rematador).
 */
function CurrentAssignmentCard({ remate }: CurrentAssignmentCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Ya estás asignado a</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{remate.title}</h2>
        </div>
        <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
      </div>

      {remate.starts_at && (
        <p className="text-sm text-ink-muted">Empieza: {formatDateTime(remate.starts_at)}</p>
      )}

      <Button className="w-full" onClick={() => navigate(`/remates/${remate.id}/gestionar`)}>
        Volver a la consola operativa
      </Button>
    </Card>
  );
}

/**
 * Pantalla de inicio del rol `rematador` acotado (ADR-047/ADR-048): a diferencia de
 * `RematadorDashboardPage` (ahora exclusiva de `empresa`, que sí es dueña de remates),
 * un usuario `rematador` no tiene remates propios.
 *
 * Panel "mi remate actual" (Fase 1): antes de mostrar el formulario de canje, se
 * consulta `GET /remates?rematador_id=<mi_id>` (`useRemates`, mismo hook que usa
 * `CompradorDashboardPage`) -- como un rematador solo puede operar un remate a la vez
 * (`RemateService.claim_operator`), alcanza con encontrar el primero en un estado no
 * terminal para saber si ya está asignado. Si lo está, `CurrentAssignmentCard` reemplaza
 * por completo al formulario -- no tiene sentido pedirle un código nuevo a alguien que
 * ya tiene uno vigente. Si el fetch falla, se degrada al formulario de siempre en vez de
 * bloquear la pantalla: canjear un código no depende de este chequeo.
 */
export function OperatorClaimPage() {
  const { user } = useAuth();
  const { remates, isLoading, error } = useRemates({ rematadorId: user?.id });

  const navigate = useNavigate();
  const [remateId, setRemateId] = useState('');
  const [code, setCode] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <ClaimSkeleton />;
  }

  const currentAssignment = error
    ? null
    : (remates.find((remate) => ACTIVE_ASSIGNMENT_STATUSES.has(remate.status)) ?? null);

  if (currentAssignment) {
    return <CurrentAssignmentCard remate={currentAssignment} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClaimError(null);
    setIsSubmitting(true);
    try {
      const remate = await claimOperatorRequest(remateId.trim(), code.trim());
      navigate(`/remates/${remate.id}/gestionar`);
    } catch (err) {
      setClaimError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Unirme como operador
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Ingresá el ID del remate y el código que te compartió la empresa para entrar a
          operarlo en vivo.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {claimError && <Alert variant="error">{claimError}</Alert>}

          <Input
            label="ID del remate"
            required
            value={remateId}
            onChange={(event) => setRemateId(event.target.value)}
            placeholder="Lo comparte la empresa junto con el código"
          />

          <Input
            label="Código de operador"
            required
            icon={KeyRound}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Ej: A3K7P2QX"
          />

          <Button type="submit" isLoading={isSubmitting} disabled={!remateId.trim() || !code.trim()}>
            Entrar a la Consola Operativa
          </Button>
        </form>
      </Card>
    </div>
  );
}
