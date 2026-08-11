import { useNavigate } from 'react-router-dom';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { formatCurrency } from '../../../shared/lib/format';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import type { Lote } from '../../remates/types';
import { STATUS_BADGE_VARIANTS as CASE_STATUS_BADGE_VARIANTS, STATUS_LABELS as CASE_STATUS_LABELS } from '../../postauction/labels';
import type { PostAuctionCase } from '../../postauction/types';
import type { LoteHistoryDetail } from '../types';

export interface LoteResultCardProps {
  lote: Lote;
  currency: string;
  /** `undefined` = todavía no se pidió (lote `pending`/`cancelled`), `null` = se pidió y
   * falló esa llamada puntual -- en ambos casos se muestra "—", ver `useLoteResultsForRemate`. */
  offerDetail: LoteHistoryDetail | null | undefined;
  /** Caso post-remate cruzado por `lote_id` -- `undefined` si el lote se vendió pero
   * todavía no tiene un caso (o el cruce no lo encontró). */
  postAuctionCase: PostAuctionCase | undefined;
}

/**
 * Card de resultado de un lote dentro del informe ejecutivo -- reemplaza a
 * `LoteHistoryCard` (que solo linkeaba al detalle histórico con nombre/precio final):
 * acá va toda la información que el pedido original quiere ver "de un vistazo", sin
 * entrar al detalle de cada lote. Email/teléfono del ganador vienen de
 * `postAuctionCase` (`PostAuctionCaseRematadorRead` en el backend) o, si ese caso
 * todavía no se resolvió, de `offerDetail.winner` (`LoteWinner`, `app/history/schemas.py`)
 * -- ambos ya los exponen. Si de verdad no hay dato (ganador sin teléfono cargado, por
 * ejemplo) se muestra "No registrado", nunca se inventa un valor.
 */
export function LoteResultCard({ lote, currency, offerDetail, postAuctionCase }: LoteResultCardProps) {
  const navigate = useNavigate();
  const isSold = lote.status === 'closed_sold';
  const isUnsold = lote.status === 'closed_unsold';
  const winnerName = postAuctionCase?.buyer_name ?? offerDetail?.winner?.buyer_name ?? null;
  const winnerEmail = postAuctionCase?.buyer_email ?? offerDetail?.winner?.buyer_email ?? null;
  const winnerPhone = postAuctionCase?.buyer_phone ?? offerDetail?.winner?.buyer_phone ?? null;
  const offerCountLabel = offerDetail ? String(offerDetail.offer_count) : '—';

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-slate-100">
        {lote.images[0] ? (
          <img src={lote.images[0].url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" />
        )}
        <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]} className="absolute right-3 top-3 shadow-sm">
          {LOTE_STATUS_LABELS[lote.status]}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Lote {lote.lot_number}</p>
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{lote.title}</h3>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center text-xs">
          <div>
            <p className="text-slate-400">Precio inicial</p>
            <p className="font-semibold text-slate-900">{formatCurrency(lote.base_price, currency)}</p>
          </div>
          <div>
            <p className="text-slate-400">Precio final</p>
            <p className="font-semibold text-slate-900">
              {lote.final_price ? formatCurrency(lote.final_price, currency) : '—'}
            </p>
          </div>
          <div>
            <p className="text-slate-400">Ofertas</p>
            <p className="font-semibold text-slate-900">{offerCountLabel}</p>
          </div>
        </div>

        {isSold && (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-slate-900">{winnerName ?? 'Ganador sin datos'}</span>
              {postAuctionCase && (
                <Badge variant={CASE_STATUS_BADGE_VARIANTS[postAuctionCase.status]}>
                  {CASE_STATUS_LABELS[postAuctionCase.status]}
                </Badge>
              )}
            </div>
            <dl className="flex flex-col gap-1 text-slate-500">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0">Email</dt>
                <dd className="min-w-0 truncate text-right" title={winnerEmail ?? undefined}>
                  {winnerEmail ?? <span className="text-slate-400">No registrado</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0">Teléfono</dt>
                <dd className="min-w-0 truncate text-right" title={winnerPhone ?? undefined}>
                  {winnerPhone ?? <span className="text-slate-400">No registrado</span>}
                </dd>
              </div>
            </dl>
            <Button
              variant="secondary"
              disabled={!postAuctionCase}
              title={postAuctionCase ? undefined : 'Todavía no hay un caso post-remate para este lote'}
              className="mt-1 h-8 w-full justify-center text-xs"
              onClick={() => postAuctionCase && navigate(`/ventas-adjudicadas/${postAuctionCase.id}`)}
            >
              Ir a Ventas Adjudicadas
            </Button>
          </div>
        )}

        {isUnsold && (
          <div className="mt-auto rounded-lg bg-slate-50 p-3 text-center text-xs font-medium text-slate-500">
            Sin ofertas válidas
          </div>
        )}
      </div>
    </div>
  );
}
