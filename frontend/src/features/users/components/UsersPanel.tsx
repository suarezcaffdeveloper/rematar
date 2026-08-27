import { useState } from 'react';
import { CheckCircle2, ShieldAlert, Users as UsersIcon } from 'lucide-react';
import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { normalizeApiError } from '../../../shared/api/errors';
import { ROLES_PENDING_APPROVAL, type User, type UserRole } from '../../auth/types';
import { useUsersList } from '../hooks';
import { updateUserStatusRequest } from '../api';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  empresa: 'Empresa',
  rematador: 'Martillero',
  comprador: 'Comprador',
};

/**
 * Pestaña "Usuarios" del panel de administrador (RF-03) -- lista `GET /users` y permite
 * aprobar/suspender con `PATCH /users/{id}/status`. Ambos endpoints ya existían en el
 * backend desde la Fase RF-03 original; esta pantalla es la primera interfaz que los usa
 * (antes había que llamarlos a mano, ver memoria de la sesión que agregó empresa/
 * rematador con aprobación previa).
 */
export function UsersPanel() {
  const [page, setPage] = useState(1);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [userToSuspend, setUserToSuspend] = useState<User | null>(null);
  const [pendingActionUserId, setPendingActionUserId] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useUsersList(page, PAGE_SIZE, pendingOnly);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  function handlePendingOnlyChange(next: boolean) {
    setPendingOnly(next);
    setPage(1);
  }

  async function handleActivate(user: User) {
    setActionError(null);
    setPendingActionUserId(user.id);
    try {
      await updateUserStatusRequest(user.id, true);
      reload();
    } catch (err) {
      setActionError(normalizeApiError(err).message);
    } finally {
      setPendingActionUserId(null);
    }
  }

  async function handleConfirmSuspend() {
    if (!userToSuspend) return;
    setActionError(null);
    setPendingActionUserId(userToSuspend.id);
    try {
      await updateUserStatusRequest(userToSuspend.id, false);
      reload();
    } catch (err) {
      setActionError(normalizeApiError(err).message);
    } finally {
      setPendingActionUserId(null);
      setUserToSuspend(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => handlePendingOnlyChange(event.target.checked)}
            className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
          />
          Solo pendientes de aprobación
        </label>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {error ? (
        <Alert variant="error">No se pudo cargar la lista de usuarios.</Alert>
      ) : isLoading && data.items.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title={pendingOnly ? 'No hay cuentas pendientes' : 'Sin usuarios'}
          description={
            pendingOnly
              ? 'Ninguna cuenta de empresa o martillero está esperando aprobación en este momento.'
              : 'Todavía no hay usuarios registrados.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Registrado</th>
                <th className="px-4 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((user) => {
                const isPending = !user.is_active && ROLES_PENDING_APPROVAL.has(user.role);
                const isActing = pendingActionUserId === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-ink">{user.full_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{user.email}</td>
                    <td className="px-4 py-3 text-ink-muted">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3">
                      {user.is_active ? (
                        <Badge variant="success">Activo</Badge>
                      ) : isPending ? (
                        <Badge variant="warning">Pendiente</Badge>
                      ) : (
                        <Badge variant="danger">Suspendido</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{formatDateTime(user.created_at)}</td>
                    <td className="px-4 py-3">
                      {user.is_active ? (
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          isLoading={isActing}
                          onClick={() => setUserToSuspend(user)}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          Suspender
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          className="px-3 py-1.5 text-xs"
                          isLoading={isActing}
                          onClick={() => handleActivate(user)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {isPending ? 'Aprobar' : 'Reactivar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs text-ink-faint">
            {data.total} {data.total === 1 ? 'usuario' : 'usuarios'} · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={userToSuspend !== null}
        onClose={() => setUserToSuspend(null)}
        onConfirm={handleConfirmSuspend}
        title="Suspender cuenta"
        message={
          userToSuspend
            ? `"${userToSuspend.full_name}" no va a poder iniciar sesión hasta que se reactive su cuenta, y se van a cerrar sus sesiones activas ahora mismo.`
            : ''
        }
        confirmLabel="Suspender"
        variant="danger"
      />
    </div>
  );
}
