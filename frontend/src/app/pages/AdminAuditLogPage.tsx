import { AuditLogView } from '../../features/audit/components/AuditLogView';

/**
 * Panel de auditoría global del administrador (Épica 7, Módulo 7.2), en `/admin` --
 * reemplaza el placeholder de `RequireRole` de la Épica 4.1 (`AdminPlaceholderPage`, ya
 * no existe). El backend (`AuditService.list_global`) exige rol `admin` igual que esta
 * ruta ya lo exigía (`RequireRole allowedRoles={['admin']}`, ver `app/router.tsx`) --
 * doble verificación, no redundante: esta ruta protege la navegación, el backend
 * protege el dato aunque alguien llame a la API directo. Ver
 * docs/36-sistema-de-auditoria-y-trazabilidad.md.
 */
export function AdminAuditLogPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Auditoría de la plataforma</h1>
        <p className="mt-1 text-sm text-slate-600">
          Historial completo de acciones importantes realizadas en RematAR: inicios de
          sesión, remates, lotes, ofertas y moderación de chat.
        </p>
      </div>
      <AuditLogView scope={{ type: 'global' }} />
    </div>
  );
}
