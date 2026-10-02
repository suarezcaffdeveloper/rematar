import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, Info, Mail, Phone, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { STATUS_LABELS as SALE_STATUS_LABELS } from '../../postauction/labels';
import { statusIndex } from '../../postauction/sales';
import type { PostAuctionCase } from '../../postauction/types';
import type { Lote } from '../../remates/types';
import { useLoteHistoryDetail } from '../hooks';
import { formatDurationLong } from '../summary';
import type { OfertaHistoryEntry } from '../types';

const OFFERS_PAGE_SIZE = 20;

const OFFER_STATUS: Record<OfertaHistoryEntry['status'], { label: string; tone: string }> = {
  winning: { label: 'Ganadora', tone: 'bg-success-50 text-success-700' },
  accepted: { label: 'Aceptada', tone: 'bg-success-50 text-success-700' },
  outbid: { label: 'Superada', tone: 'border border-line bg-surface-subtle text-ink-muted' },
  rejected: { label: 'Rechazada', tone: 'bg-danger-50 text-danger-600' },
};

export interface LoteHistoryDrawerProps {
  remateId: string;
  lote: Lote;
  currency: string;
  postAuctionCase: PostAuctionCase | undefined;
  onClose: () => void;
}

/**
 * Detalle de un lote del remate terminado, en un panel lateral: precio base y final, cuántas
 * ofertas recibió, cuánto estuvo abierto, quién ganó (con email y teléfono, y un acceso a su
 * venta) y todas las ofertas. Reemplaza a la página `LoteHistoryDetailPage`, a la que no
 * llegaba ningún link: ahora se abre tocando el lote. Las ofertas se piden de a 20
 * (`useLoteHistoryDetail`) y "Ver más" suma la página siguiente.
 */
export function LoteHistoryDrawer({ remateId, lote, currency, postAuctionCase, onClose }: LoteHistoryDrawerProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<Record<number, OfertaHistoryEntry[]>>({});
  const { data, isLoading, error, reload } = useLoteHistoryDetail(remateId, lote.id, page, OFFERS_PAGE_SIZE);

  useFocusTrap(dialogRef, true);

  useEffect(() => {
    if (data && !isLoading) setLoaded((prev) => ({ ...prev, [page]: data.offer_history.items }));
  }, [data, isLoading, page]);

  // `onClose` suele ser una función nueva en cada render del padre: se guarda en un ref para
  // que el efecto de abajo (foco inicial, scroll del fondo) corra solo al abrir.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, []);

  const offers = useMemo(
    () =>
      Object.keys(loaded)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((key) => loaded[key]),
    [loaded],
  );
  const total = data?.offer_history.total ?? 0;
  const sold = (data?.status ?? lote.status) === 'closed_sold';
  const unpaid = postAuctionCase ? statusIndex(postAuctionCase.status) <= 2 : false;
  const winner = data?.winner ?? null;
  const winnerName = postAuctionCase?.buyer_name ?? winner?.buyer_name ?? null;
  const winnerEmail = postAuctionCase?.buyer_email ?? winner?.buyer_email ?? null;
  const winnerPhone = postAuctionCase?.buyer_phone ?? winner?.buyer_phone ?? null;
  const offerCount = data?.offer_count ?? 0;
  const remaining = Math.max(0, total - offers.length);

  return createPortal(
    <div className="fixed inset-0 z-[45]">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Lote ${lote.lot_number}`}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[40rem] flex-col bg-white font-display text-ink shadow-[-30px_0_80px_-30px_rgba(16,17,20,0.5)] focus:outline-none"
        initial={reduceMotion ? false : { x: 44, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="flex items-start gap-4 px-6 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sold ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-600'}`}>
                {sold ? 'Vendido' : lote.status === 'cancelled' || lote.status === 'pending' ? 'No llegó a abrirse' : 'Sin vender'}
              </span>
              {sold && unpaid && <span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-700">Sin cobrar</span>}
            </div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">
              Lote {lote.lot_number} · {lote.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-8 pt-1">
          {error && !data ? (
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{error.message}</span>
                <Button variant="secondary" onClick={reload}>
                  Reintentar
                </Button>
              </div>
            </Alert>
          ) : isLoading && !data ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-ink pt-4">
                <div>
                  <dt className="text-sm text-ink-muted">Precio base</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(lote.base_price, currency)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">Precio final</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
                    {lote.final_price ? formatCurrency(lote.final_price, currency) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">Ofertas recibidas</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{offerCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">Tiempo abierto</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-tight">{formatDurationLong(data?.time_open_seconds)}</dd>
                </div>
              </dl>

              {data?.cancellation_reason && <Alert variant="warning">Cancelado: {data.cancellation_reason}</Alert>}

              {sold ? (
                <section aria-label="Ganador" className="grid gap-1.5 rounded-3xl bg-brand-50 p-5">
                  <span className="text-xs font-bold text-ink-muted">Ganó este lote</span>
                  <b className="text-xl tracking-tight">{winnerName ?? 'Ganador sin datos'}</b>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail aria-hidden="true" className="h-3.5 w-3.5 text-ink-faint" />
                    {winnerEmail ? (
                      <a href={`mailto:${winnerEmail}`} className="font-medium text-brand-700 hover:underline">
                        {winnerEmail}
                      </a>
                    ) : (
                      <span className="text-ink-muted">No registrado</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone aria-hidden="true" className="h-3.5 w-3.5 text-ink-faint" />
                    <span className={winnerPhone ? '' : 'text-ink-muted'}>{winnerPhone ?? 'No registrado'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2.5">
                    {postAuctionCase && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${unpaid ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700'}`}>
                        {SALE_STATUS_LABELS[postAuctionCase.status]}
                      </span>
                    )}
                    <Button
                      variant="secondary"
                      className="ml-auto rounded-full"
                      disabled={!postAuctionCase}
                      title={postAuctionCase ? undefined : 'Todavía no hay una venta registrada para este lote'}
                      onClick={() => postAuctionCase && navigate(`/ventas-adjudicadas/${postAuctionCase.id}`)}
                    >
                      Ir a la venta
                      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </section>
              ) : (
                <p className="flex gap-2.5 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                  <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {offerCount > 0 ? 'Este lote recibió ofertas, pero ninguna cerró la venta.' : 'Nadie ofertó por este lote.'} Podés volver a ofrecerlo en otro remate.
                  </span>
                </p>
              )}

              <section aria-labelledby="offers-title">
                <h3 id="offers-title" className="mb-2 text-xs font-bold text-ink-muted">
                  Todas las ofertas
                </h3>
                {offers.length === 0 ? (
                  <p className="text-ink-muted">Este lote no recibió ofertas.</p>
                ) : (
                  <ul className="border-t border-ink">
                    {offers.map((offer) => {
                      const status = OFFER_STATUS[offer.status] ?? OFFER_STATUS.outbid;
                      return (
                        <li key={offer.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line py-3 text-sm">
                          <div className="min-w-0">
                            <b className="block truncate font-semibold">{offer.buyer_name ?? 'Comprador'}</b>
                            <span className="text-xs text-ink-muted">{formatDateTime(offer.created_at)}</span>
                          </div>
                          <b className="font-semibold tabular-nums">{formatCurrency(offer.amount, currency)}</b>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
                          {offer.rejection_reason && <span className="col-span-3 -mt-1 text-xs text-danger-600">{offer.rejection_reason}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {remaining > 0 && (
                  <div className="mt-3">
                    <Button variant="ghost" onClick={() => setPage((current) => current + 1)} isLoading={isLoading}>
                      Ver las {remaining} {remaining === 1 ? 'oferta restante' : 'ofertas restantes'}
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
