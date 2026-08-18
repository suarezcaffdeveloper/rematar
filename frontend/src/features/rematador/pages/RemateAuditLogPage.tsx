import { useNavigate, useParams } from 'react-router-dom';
import { AuditLogView } from '../../audit/components/AuditLogView';
import { useRemateDetail } from '../../remates/hooks';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';

/**
 * Auditoría de un remate puntual (Épica 7, Módulo 7.2), en `/remates/:remateId/auditoria`
 * -- reutiliza `useRemateDetail` (Épica 4.4) tal cual, solo para el título del breadcrumb.
 * Sin `RequireRole` a nivel de ruta, mismo criterio que `/remates/:remateId/lotes` y
 * `/gestionar`: el backend decide quién puede verla (`AuditService.list_for_remate` --
 * dueño del remate o administrador, 403 para cualquier otro, 404 si ni siquiera es
 * visible). Ver docs/36-sistema-de-auditoria-y-trazabilidad.md.
 */
export function RemateAuditLogPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const id = remateId ?? '';

  const { remate, isLoading, error, reload } = useRemateDetail(id);

  const items: BreadcrumbItem[] = isLoading
    ? []
    : error || !remate
      ? [{ label: 'Mis remates', to: '/' }, { label: 'Remate no encontrado' }]
      : [
          { label: 'Mis remates', to: '/' },
          { label: remate.title, to: `/remates/${id}/lotes` },
          { label: 'Auditoría' },
        ];
  useBreadcrumb(items);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error || !remate) {
    return (
      <div className="flex flex-col gap-6">
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Auditoría del remate</h1>
        <p className="mt-1 text-sm text-slate-600">
          Historial de acciones sobre este remate: creación y cambios, apertura/cierre y
          adjudicación de lotes, ofertas y moderación de chat.
        </p>
      </div>

      <AuditLogView scope={{ type: 'remate', remateId: id }} />
    </div>
  );
}
