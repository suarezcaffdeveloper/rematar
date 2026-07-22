import { Card } from '../../../shared/components/Card';
import type { ChatActivitySummary } from '../types';

export interface ChatActivityCardProps {
  activity: ChatActivitySummary;
}

/** Resumen de actividad del chat (Épica 7, Módulo 7.3) -- solo mensajes de usuario (no
 * cuenta los mensajes de sistema del ciclo de vida del remate, Módulo 6.4). */
export function ChatActivityCard({ activity }: ChatActivityCardProps) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-800">Actividad del chat</h3>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-slate-900">{activity.message_count}</span>
          <span className="text-xs text-slate-500">Mensajes</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-slate-900">{activity.participant_count}</span>
          <span className="text-xs text-slate-500">Participantes</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-slate-900">{activity.deleted_count}</span>
          <span className="text-xs text-slate-500">Moderados</span>
        </div>
      </div>
    </Card>
  );
}
