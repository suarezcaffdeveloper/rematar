import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Gavel } from 'lucide-react';
import type { Remate } from '../../remates/types';
import { OperatorCodePanel } from './OperatorCodePanel';
import { StreamPanel } from './StreamPanel';
import { YouTubeMark } from './YouTubeMark';

export interface ConsolaQuickPanelsProps {
  remate: Remate;
  isOwner: boolean;
  onRemateChange: (remate: Remate) => void;
}

type PanelId = 'stream' | 'operator';

const TOGGLE_BASE =
  'flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border text-[13px] font-semibold transition-colors';
const TOGGLE_IDLE = 'border-line bg-white text-ink-muted hover:bg-surface-subtle';
const TOGGLE_STREAM_ACTIVE = 'border-danger-200 bg-danger-50 text-danger-700';
const TOGGLE_OPERATOR_ACTIVE = 'border-warning-200 bg-warning-50 text-warning-800';

/**
 * Reemplaza a las dos cards a todo lo ancho que vivían arriba de la Consola en vivo/
 * pausada ("Transmisión en vivo" y "Datos para el martillero", ver `StreamPanel`/
 * `OperatorCodePanel` `variant="card"`) -- diseño aprobado: dos botones angostos, a la
 * misma altura que el título/fecha/tiempo/conectados de `ConsolaHeader` (ambos son el
 * primer elemento de su columna en el grid de `ConsolaOperativaPage`, así que arrancan
 * a la misma altura sin necesidad de coordinarse), ocupando el ancho de la columna del
 * sidebar (chat/ofertas). Cada botón abre un globito de color propio -- rojo/YouTube
 * para la transmisión, naranja/martillo para los datos del martillero -- que FLOTA por
 * encima del panel (`position: absolute`, no empuja el chat/ofertas de abajo) con una
 * puntita apuntando al botón que lo abrió. Abrir uno cierra el otro: los dos ocupan el
 * mismo ancho/posición (toda la columna), así que mostrarlos juntos se superpondría.
 *
 * Vive dentro de `ConsolaSidebar` (primer elemento de su contenedor `sticky`), no en
 * `ConsolaOperativaPage` directamente -- necesita saber si el viewer es la empresa
 * dueña (`isOwner`, para el botón "Martillero", exclusivo de la empresa) y el `remate`
 * completo (para `StreamPanel`/`OperatorCodePanel`), datos que ya tiene `ConsolaSidebar`.
 */
export function ConsolaQuickPanels({ remate, isOwner, onRemateChange }: ConsolaQuickPanelsProps) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);

  const showStream = remate.status !== 'finished' && remate.status !== 'cancelled';
  const showOperator = isOwner && remate.status !== 'finished' && remate.status !== 'cancelled';

  if (!showStream && !showOperator) return null;

  function toggle(panel: PanelId) {
    setOpenPanel((current) => (current === panel ? null : panel));
  }

  return (
    <div className="relative flex items-center gap-2">
      {showStream && (
        <button
          type="button"
          onClick={() => toggle('stream')}
          className={clsx(TOGGLE_BASE, openPanel === 'stream' ? TOGGLE_STREAM_ACTIVE : TOGGLE_IDLE)}
        >
          <YouTubeMark size={18} />
          <span>Transmisión</span>
          <ChevronDown
            aria-hidden="true"
            className={clsx('h-3 w-3 shrink-0 transition-transform', openPanel === 'stream' && 'rotate-180')}
          />
        </button>
      )}

      {showOperator && (
        <button
          type="button"
          onClick={() => toggle('operator')}
          className={clsx(TOGGLE_BASE, openPanel === 'operator' ? TOGGLE_OPERATOR_ACTIVE : TOGGLE_IDLE)}
        >
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-warning-100">
            <Gavel aria-hidden="true" className="h-[11px] w-[11px] text-warning-800" strokeWidth={2.2} />
          </span>
          <span>Martillero</span>
          <ChevronDown
            aria-hidden="true"
            className={clsx('h-3 w-3 shrink-0 transition-transform', openPanel === 'operator' && 'rotate-180')}
          />
        </button>
      )}

      {openPanel === 'stream' && (
        <div className="absolute left-0 top-[calc(100%+14px)] z-30 w-full">
          <div className="relative">
            <span
              aria-hidden="true"
              className={clsx(
                'absolute -top-[7px] h-3.5 w-3.5 rotate-45 rounded-tl-[3px] border-l border-t border-danger-200 bg-white',
                // Con los dos botones (empresa dueña) la puntita apunta al de la izquierda;
                // sin "Martillero" (rematador operador) el de Transmisión ocupa toda la fila.
                showOperator ? 'left-[86px]' : 'left-[calc(50%-7px)]',
              )}
            />
            <div className="rounded-2xl border border-danger-200 bg-white p-4 shadow-[0_14px_32px_rgba(220,38,38,0.16),0_2px_8px_rgba(16,17,20,0.06)]">
              <StreamPanel remate={remate} onChange={onRemateChange} variant="popover" onClose={() => setOpenPanel(null)} />
            </div>
          </div>
        </div>
      )}

      {openPanel === 'operator' && (
        <div className="absolute left-0 top-[calc(100%+14px)] z-30 w-full">
          <div className="relative">
            <span
              aria-hidden="true"
              className="absolute -top-[7px] left-[280px] h-3.5 w-3.5 rotate-45 rounded-tl-[3px] border-l border-t border-warning-200 bg-white"
            />
            <div className="rounded-2xl border border-warning-200 bg-white p-4 shadow-[0_14px_32px_rgba(217,119,6,0.14),0_2px_8px_rgba(16,17,20,0.06)]">
              <OperatorCodePanel remate={remate} variant="popover" onClose={() => setOpenPanel(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
