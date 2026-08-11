import { memo } from 'react';
import { Trophy } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { OFERTA_STATUS_BADGE_VARIANTS, OFERTA_STATUS_LABELS } from '../../sala/labels';
import type { OfertaSnapshotEntry } from '../../sala/types';

export interface ConsolaOfferPanelProps {
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
  /** Cuántas filas del historial quedan visibles sin scroll (Modo Remate: la columna
   * derecha de la consola deja esta tarjeta siempre visible, fuera de pestañas, así que
   * el historial tiene que ser corto a propósito -- "no quiero una tabla enorme" -- para
   * no competir por el espacio que necesita el chat debajo). No recorta la lista en sí:
   * se siguen renderizando todas las `recentOffers`, solo que el contenedor limita su
   * alto a `maxHistory` filas y agrega scroll interno para llegar al resto -- a
   * diferencia de cortar el array, ninguna oferta queda inaccesible. Sin límite por
   * default para no romper ningún otro uso de este panel. */
  maxHistory?: number;
}

/** Alto aproximado de una fila del historial (padding + las dos líneas de texto) más el
 * `gap-1.5` entre filas -- con esto `maxHistory` se traduce a un `max-height` en vez de
 * cortar el array, ver el prop de arriba. */
const HISTORY_ROW_HEIGHT_REM = 3.5;

/** Una fila del historial. `memo`: un evento en vivo que agrega una oferta nueva no
 * debería re-renderizar las que ya estaban -- mismo criterio de optimización que
 * `OfferHistoryEntry` en `features/sala/components/OfferHistoryPanel.tsx` (Épica 4.5),
 * acá reimplementado en vez de importado para no acoplar la Consola a un componente de
 * la experiencia del comprador que este módulo tiene prohibido tocar.
 *
 * La fila con `status === 'winning'` se resalta en verde (borde + fondo + monto en
 * verde, más un ícono de trofeo) -- pedido explícito: sin la tarjeta separada de
 * "Comprador líder" que tenía antes el panel (ver `ConsolaOfferPanel`), esta fila del
 * historial es la única señal de quién va ganando, así que tiene que notarse a simple
 * vista y no depender solo del texto chico del `Badge` "Ganadora". */
const OfferEntry = memo(function OfferEntry({
  offer,
  currency,
  isLatest,
}: {
  offer: OfertaSnapshotEntry;
  currency: string;
  isLatest: boolean;
}) {
  const isWinning = offer.status === 'winning';

  return (
    <li
      className={clsx(
        'flex items-center justify-between gap-2 rounded-lg border-l-4 px-3 py-2 transition-colors',
        isWinning
          ? 'border-l-success-500 bg-success-50'
          : isLatest
            ? 'border-l-slate-900 bg-slate-100'
            : 'border-l-transparent bg-slate-50',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isWinning && <Trophy aria-hidden="true" className="h-4 w-4 shrink-0 text-success-600" />}
        <div className="min-w-0">
          <p className={clsx('text-sm font-semibold', isWinning ? 'text-success-800' : 'text-slate-800')}>
            {formatCurrency(offer.amount, currency)}
          </p>
          <p className="text-xs text-slate-400">{formatDateTime(offer.created_at)}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isLatest && <Badge variant="neutral">Última</Badge>}
        {/* `!bg-white`: sobre el fondo `bg-success-50` de la fila ganadora, la variante
         * `success` normal del `Badge` (también `bg-success-50`) se le mimetizaba encima
         * -- pedido explícito: fondo blanco para que la nubecita "Ganadora" se despegue
         * del verde clarito de la fila, con el mismo verde oscuro de texto que ya tenía. */}
        <Badge
          variant={OFERTA_STATUS_BADGE_VARIANTS[offer.status]}
          className={isWinning ? '!bg-white' : undefined}
        >
          {OFERTA_STATUS_LABELS[offer.status]}
        </Badge>
      </div>
    </li>
  );
});

/**
 * Panel de ofertas de la Consola Operativa (Épica 5, Módulo 5.2): historial reciente
 * (anonimizado -- mismo criterio de privacidad que toda la app, ver
 * `docs/27-sala-del-remate.md`, "Anonimato de compradores": ni siquiera el rematador
 * dueño ve una identidad resoluble, no existe endpoint para eso), con hora de cada
 * oferta, la más reciente destacada, y la oferta líder (`status === 'winning'`)
 * resaltada en verde -- ver `OfferEntry`. Ya no tiene una tarjeta separada arriba con el
 * monto de la oferta líder (pedido explícito: quitarla, redundante con la fila `winning`
 * del propio historial). `recentOffers` llega ya resuelto por `useLiveRemateState`
 * (reusado de `features/sala/hooks.ts`, Épica 4.6) -- este panel no sabe de dónde sale ni
 * si vino de HTTP o de un evento de WebSocket.
 */
export function ConsolaOfferPanel({ recentOffers, currency, maxHistory }: ConsolaOfferPanelProps) {
  const latestOfferId = recentOffers[0]?.id;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Historial reciente</h2>
        <span className="text-sm font-semibold text-slate-700">{recentOffers.length}</span>
      </div>

      {recentOffers.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Todavía no hay ofertas en este lote.</p>
      ) : (
        <ul
          className={clsx('mt-1 flex flex-col gap-1.5', maxHistory && 'overflow-y-auto pr-1')}
          style={maxHistory ? { maxHeight: `${maxHistory * HISTORY_ROW_HEIGHT_REM}rem` } : undefined}
        >
          {recentOffers.map((offer) => (
            <OfferEntry key={offer.id} offer={offer} currency={currency} isLatest={offer.id === latestOfferId} />
          ))}
        </ul>
      )}
    </div>
  );
}
