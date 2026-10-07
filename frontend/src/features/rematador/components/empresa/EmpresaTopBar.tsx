import clsx from 'clsx';
import { ArrowLeft, ExternalLink, MessageCircleQuestion, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../../../shared/lib/format';
import type { ConnectionStatus } from '../../../../shared/websocket/client';
import { ConnectionStatusBadge } from '../../../sala/components/ConnectionStatusBadge';
import type { OfertaSnapshotEntry } from '../../../sala/types';
import { STATUS_LABELS } from '../../../remates/labels';
import type { Lote, Remate } from '../../../remates/types';

/** Alto fijo de la barra: el riel lateral se pega justo debajo con este mismo valor. */
export const TOP_BAR_HEIGHT_CLASS = 'h-16';

export interface EmpresaTopBarProps {
  remate: Remate;
  activeLote: Lote | null;
  winningOffer: OfertaSnapshotEntry | null;
  elapsed: string | null;
  connectionStatus: ConnectionStatus;
  currency: string;
  raised: string | null;
  connectedUsers: number;
  pendingQuestions: number;
  urgentAlerts: number;
  /** Lleva a la bandeja de preguntas del riel lateral. */
  onOpenQuestions: () => void;
  /** Lleva al apartado de avisos del Resumen. */
  onOpenAlerts: () => void;
}

function Metric({ label, value, detail, strong, className }: { label: string; value: string; detail?: string | null; strong?: boolean; className?: string }) {
  return (
    <div className={clsx('min-w-0 border-l border-line pl-6', className)}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2 whitespace-nowrap">
        <span className={clsx('truncate font-semibold tabular-nums tracking-tight', strong ? 'text-xl' : 'text-base')}>{value}</span>
        {detail && <span className="text-xs font-semibold tabular-nums text-success-700">{detail}</span>}
      </p>
    </div>
  );
}

/**
 * Barra superior de la Cabina de la empresa: a la izquierda, volver y qué remate es (con su
 * estado y hace cuánto empezó); al centro, el lote en remate con su oferta líder y las cifras que
 * importan de un vistazo; a la derecha, lo que pide acción (preguntas, avisos) y "Ver como
 * comprador". Alto fijo, para que el riel lateral encaje justo debajo.
 */
export function EmpresaTopBar({
  remate,
  activeLote,
  winningOffer,
  elapsed,
  connectionStatus,
  currency,
  raised,
  connectedUsers,
  pendingQuestions,
  urgentAlerts,
  onOpenQuestions,
  onOpenAlerts,
}: EmpresaTopBarProps) {
  const isPaused = remate.status === 'paused';
  const base = activeLote ? Number(activeLote.base_price) : 0;
  const lead = winningOffer ? Number(winningOffer.amount) : null;
  const overBase = lead !== null && base > 0 ? `+${Math.round(((lead - base) / base) * 100)} %` : null;

  return (
    <header className={clsx('sticky top-0 z-40 border-b border-line bg-white', TOP_BAR_HEIGHT_CLASS)}>
      <div className="flex h-full w-full items-center gap-x-6 px-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 shrink items-center gap-4 basis-72">
          <Link
            to="/"
            aria-label="Volver a Mis remates"
            title="Volver a Mis remates"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight">{remate.title}</h1>
            <p className="mt-1 flex items-center gap-2.5 text-xs">
              <span
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold',
                  isPaused ? 'bg-surface-subtle text-ink-muted ring-1 ring-line' : 'bg-success-50 text-success-700',
                )}
              >
                <span aria-hidden="true" className={clsx('h-1.5 w-1.5 rounded-full', isPaused ? 'bg-ink-faint' : 'animate-pulse bg-success-500 motion-reduce:animate-none')} />
                {STATUS_LABELS[remate.status]}
              </span>
              {elapsed && <span className="tabular-nums text-ink-muted">{elapsed}</span>}
              {connectionStatus !== 'open' && <ConnectionStatusBadge status={connectionStatus} />}
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-x-6 md:flex">
          <Metric
            label={activeLote ? `En remate · Lote ${activeLote.lot_number}` : 'En remate'}
            value={activeLote ? activeLote.title : 'Entre lotes'}
            className="max-w-[16rem] border-l-0 pl-0 xl:border-l xl:pl-6"
          />
          <Metric label="Oferta líder" value={lead !== null ? formatCurrency(winningOffer!.amount, currency) : '—'} detail={overBase} strong />
          <Metric label="Recaudado" value={raised ?? '—'} className="hidden lg:block" />
          <Metric label="Conectados" value={String(connectedUsers)} className="hidden 2xl:block" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {pendingQuestions > 0 && (
            <button
              type="button"
              onClick={onOpenQuestions}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
              {pendingQuestions} {pendingQuestions === 1 ? 'pregunta' : 'preguntas'}
            </button>
          )}
          {urgentAlerts > 0 && (
            <button
              type="button"
              onClick={onOpenAlerts}
              className="hidden h-9 items-center gap-2 rounded-full bg-warning-100 px-4 text-sm font-semibold text-warning-800 transition-colors hover:bg-warning-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 md:inline-flex"
            >
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {urgentAlerts} {urgentAlerts === 1 ? 'aviso' : 'avisos'}
            </button>
          )}
          <a
            href={`/remates/${remate.id}/sala`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ver como comprador</span>
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </div>
      </div>
    </header>
  );
}
