import { Bot, MessageCircle, Pencil, Timer, Trash2, Wallet } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import { formatCurrency } from '../../../shared/lib/format';
import { PERSONALITY_BADGE_VARIANTS, PERSONALITY_LABELS } from '../labels';
import type { BotProfile } from '../types';

export interface BotProfileCardProps {
  bot: BotProfile;
  onEdit: (bot: BotProfile) => void;
  onDelete: (bot: BotProfile) => void;
}

/** Tarjeta de un bot en `BotProfilesPage` -- pensada para que el rematador entienda de
 * un vistazo qué bot tiene, qué estrategia usa y si está activo, sin abrir nada (pedido
 * explícito: minimalista, no una herramienta técnica). */
export function BotProfileCard({ bot, onEdit, onDelete }: BotProfileCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white">
            <Bot aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{bot.display_name}</p>
            <Badge variant={PERSONALITY_BADGE_VARIANTS[bot.personality]}>
              {PERSONALITY_LABELS[bot.personality]}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={bot.is_active ? 'success' : 'neutral'}>{bot.is_active ? 'Activo' : 'Inactivo'}</Badge>
          <DropdownMenu
            items={[
              { label: 'Editar', onSelect: () => onEdit(bot) },
              { label: 'Eliminar', onSelect: () => onDelete(bot), variant: 'danger' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-3">
        <div className="flex items-center gap-1.5">
          <Wallet aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Hasta {formatCurrency(bot.max_budget, 'ARS')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Timer aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            {bot.reaction_delay_min_seconds}-{bot.reaction_delay_max_seconds}s
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          <span>{bot.participates_in_chat ? 'Participa en chat' : 'Sin chat'}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onEdit(bot)}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
        Editar configuración
      </button>
    </div>
  );
}

// Ícono reexportado para que `BotProfilesPage` no necesite importar `lucide-react`
// directamente solo para el estado vacío.
export { Bot as BotIcon, Trash2 as DeleteIcon };
