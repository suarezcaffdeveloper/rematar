import clsx from 'clsx';
import { formatCurrency } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { STATUS_LABELS as SALE_STATUS_LABELS } from '../../postauction/labels';
import { statusIndex } from '../../postauction/sales';
import type { PostAuctionCase } from '../../postauction/types';
import type { Lote } from '../../remates/types';
import { risePercent } from '../summary';
import type { LoteHistoryDetail } from '../types';
import { optimizedImage } from '../../../shared/lib/image';

export interface LoteHistoryRowProps {
  lote: Lote;
  currency: string;
  /** `undefined` = todavía no se pidió, `null` = esa llamada falló: en ambos casos "—". */
  offerDetail: LoteHistoryDetail | null | undefined;
  postAuctionCase: PostAuctionCase | undefined;
  /** El mayor porcentaje de suba del remate: escala común de las barras. */
  maxRise: number;
  onOpen: () => void;
}

function Chip({ tone, children }: { tone: 'ok' | 'bad' | 'warn' | 'mute'; children: string }) {
  const tones = {
    ok: 'bg-success-50 text-success-700',
    bad: 'bg-danger-50 text-danger-600',
    warn: 'bg-warning-50 text-warning-700',
    mute: 'border border-line bg-surface-subtle text-ink-muted',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/**
 * Un lote del remate terminado, como fila: foto, nombre y estado ("Vendido" / "Sin vender" /
 * "No llegó a abrirse"), precio base → precio final con una barra de cuánto subió (todas
 * comparables entre sí), cuántas ofertas recibió y quién ganó con el estado de su cobro.
 * Es un botón: abre el detalle del lote con todas sus ofertas (`LoteHistoryDrawer`).
 * La palabra del sistema para un lote sin comprador ("desierto") no aparece: se dice
 * "Sin vender".
 */
export function LoteHistoryRow({ lote, currency, offerDetail, postAuctionCase, maxRise, onOpen }: LoteHistoryRowProps) {
  const sold = lote.status === 'closed_sold';
  const cancelled = lote.status === 'cancelled' || lote.status === 'pending';
  const rise = risePercent(lote);
  const winnerName = postAuctionCase?.buyer_name ?? offerDetail?.winner?.buyer_name ?? null;
  const unpaid = postAuctionCase ? statusIndex(postAuctionCase.status) <= 2 : false;
  const offers = offerDetail ? offerDetail.offer_count : null;
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  return (
    <li className="border-b border-line transition-opacity duration-300">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver el detalle del lote ${lote.lot_number}: ${lote.title}`}
        className="grid w-full grid-cols-[3.4rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:grid-cols-[3.4rem_minmax(0,1.5fr)_minmax(14rem,2fr)_5rem_minmax(0,1.1fr)] lg:gap-x-5"
      >
        <span className="block h-[42px] w-[54px] overflow-hidden rounded-[10px]">
          {mainImage ? (
            <img src={optimizedImage(mainImage.url, 480)} loading="lazy" decoding="async" alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-5 w-5 text-brand-300" />} />
          )}
        </span>

        <span className="min-w-0">
          <b className="block text-[15px] font-semibold leading-snug tracking-tight">
            Lote {lote.lot_number} · {lote.title}
          </b>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {cancelled ? <Chip tone="mute">No llegó a abrirse</Chip> : sold ? <Chip tone="ok">Vendido</Chip> : <Chip tone="bad">Sin vender</Chip>}
            {sold && unpaid && <Chip tone="warn">Sin cobrar</Chip>}
          </span>
        </span>

        <span className={clsx('min-w-0 lg:block', 'col-span-3 lg:col-span-1')}>
          {cancelled ? (
            <span className="text-sm text-ink-muted">Se canceló con el remate</span>
          ) : sold && lote.final_price ? (
            <span className="grid gap-1.5">
              <span className="text-sm tabular-nums">
                <span className="text-ink-muted">{formatCurrency(lote.base_price, currency)}</span>
                <span className="mx-1.5 text-ink-faint">→</span>
                <b className="font-semibold">{formatCurrency(lote.final_price, currency)}</b>
              </span>
              <span className="flex items-center gap-2.5" role="img" aria-label={`Subió ${rise}% sobre el precio base`}>
                <span
                  className="block h-2 min-w-1 rounded-full bg-brand-600"
                  style={{ width: `${Math.max(2, ((rise ?? 0) / Math.max(1, maxRise)) * 100) * 0.7}%` }}
                />
                <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-success-700">
                  {(rise ?? 0) >= 0 ? '+' : ''}
                  {rise}%
                </span>
              </span>
            </span>
          ) : (
            <span className="grid gap-1">
              <span className="text-sm tabular-nums text-ink-muted">Base {formatCurrency(lote.base_price, currency)}</span>
              <span className="text-[13.5px] text-ink-muted">No se vendió</span>
            </span>
          )}
        </span>

        <span className="hidden text-right text-sm tabular-nums lg:block">
          {cancelled ? '—' : offers === null ? '—' : offers}
          <span className="block text-xs text-ink-muted">{offers === 1 ? 'oferta' : 'ofertas'}</span>
        </span>

        <span className="hidden min-w-0 text-[13.5px] lg:block">
          {sold ? (
            <>
              <b className="block truncate font-semibold">{winnerName ?? 'Ganador sin datos'}</b>
              {postAuctionCase && <span className="block truncate text-xs text-ink-muted">{SALE_STATUS_LABELS[postAuctionCase.status]}</span>}
            </>
          ) : cancelled ? null : (
            <span className="text-xs text-ink-muted">
              {offers === null ? '' : offers > 0 ? 'Hubo ofertas, pero ninguna cerró la venta' : 'Nadie ofertó'}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
