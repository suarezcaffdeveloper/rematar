import { useState } from 'react';
import { AuditLogView } from '../../features/audit/components/AuditLogView';
import { AdminHistoryPanel } from '../../features/history/components/AdminHistoryPanel';
import { MonitoringPanel } from '../../features/monitoring/components/MonitoringPanel';
import { Tabs } from '../../shared/components/Tabs';

type AdminTab = 'auditoria' | 'historial' | 'monitoreo';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'auditoria', label: 'Auditoría' },
  { id: 'historial', label: 'Historial' },
  { id: 'monitoreo', label: 'Monitoreo' },
];

/**
 * Panel de administrador, en `/admin` -- selector de pestañas entre Auditoría (Épica 7,
 * Módulo 7.2), Historial de remates (Épica 7, Módulo 7.3) y Monitoreo de la plataforma
 * (Épica 8, Módulo 8.1), único punto de entrada admin en vez de fragmentar la
 * navegación en rutas sueltas. Reemplaza el placeholder de `RequireRole` de la Épica
 * 4.1 (`AdminPlaceholderPage`, ya no existe). El backend
 * (`AuditService.list_global`/`HistoryService.list_finished`/
 * `GET /monitoring/metrics`) exige rol `admin` igual que esta ruta ya lo exigía
 * (`RequireRole allowedRoles={['admin']}`, ver `app/router.tsx`) -- doble
 * verificación, no redundante: esta ruta protege la navegación, el backend protege el
 * dato aunque alguien llame a la API directo. Selector de pestañas sobre
 * `shared/components/Tabs.tsx` (Épica 9, Etapa 6 -- rediseño): esta pantalla usaba su
 * propio `role="tablist"` a mano, mismo look que ese componente compartido ya extrajo
 * en la Etapa 5. Ver
 * docs/36-sistema-de-auditoria-y-trazabilidad.md,
 * docs/37-historial-y-resultados-de-remates.md y
 * docs/38-observabilidad-y-monitoreo.md.
 */
export function AdminAuditLogPage() {
  const [tab, setTab] = useState<AdminTab>('auditoria');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Panel de administrador</h1>
        <p className="mt-1 text-sm text-slate-600">
          Auditoría de acciones importantes y resultados de remates finalizados en toda
          la plataforma.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setTab(id as AdminTab)} />

      {tab === 'auditoria' && <AuditLogView scope={{ type: 'global' }} />}
      {tab === 'historial' && <AdminHistoryPanel />}
      {tab === 'monitoreo' && <MonitoringPanel />}
    </div>
  );
}
