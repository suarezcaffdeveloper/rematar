import { Alert } from '../../../shared/components/Alert';
import { Skeleton } from '../../../shared/components/Skeleton';
import { usePlatformMonitoring } from '../hooks';
import { HealthStatusPanel } from './HealthStatusPanel';
import { MetricsGrid } from './MetricsGrid';

/** Pestaña "Monitoreo" de `/admin` (Épica 8, Módulo 8.1) -- estado de salud +
 * métricas operativas, actualizado automáticamente cada 10s (`usePlatformMonitoring`). */
export function MonitoringPanel() {
  const { health, metrics, isInitialLoading, error } = usePlatformMonitoring();

  if (isInitialLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !health || !metrics) {
    return <Alert variant="error">No se pudo cargar el estado de la plataforma.</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      <HealthStatusPanel health={health} />
      <MetricsGrid metrics={metrics} />
    </div>
  );
}
