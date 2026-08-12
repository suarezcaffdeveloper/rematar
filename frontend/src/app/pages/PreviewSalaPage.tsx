import { useState } from 'react';
import { ActiveLotePanel } from '../../features/sala/components/ActiveLotePanel';
import { OfferHistoryPanel } from '../../features/sala/components/OfferHistoryPanel';
import type { Lote } from '../../features/remates/types';
import type { OfertaSnapshotEntry } from '../../features/sala/types';

const lote: Lote = {
  id: 'lote-1',
  remate_id: 'remate-1',
  lot_number: '12',
  display_order: 0,
  title: 'Lote de 30 novillos Angus',
  description:
    'Novillos Angus de invernada, buen estado sanitario, origen trazado. Disponibles para retiro en establecimiento a partir de las 48hs de adjudicado el lote.',
  category: 'hacienda',
  attributes: { peso_kg: 420, raza: 'Angus', edad_meses: 18 },
  images: [
    { url: 'https://picsum.photos/seed/lote1/1200/675', order: 0, caption: null },
    { url: 'https://picsum.photos/seed/lote2/1200/675', order: 1, caption: null },
  ],
  quantity: 30,
  unit_label: 'cabezas',
  base_price: '1000.00',
  min_increment: '50.00',
  reserve_price: null,
  final_price: null,
  status: 'open',
  timer_ends_at: new Date(Date.now() + 45_000).toISOString(),
  timer_paused_remaining_seconds: null,
  timer_auto_close_enabled: true,
  round_number: 1,
  created_at: '2026-07-01T00:00:00Z',
};

const winningOffer: OfertaSnapshotEntry = {
  id: 'oferta-1',
  buyer_id: null,
  amount: '1500.00',
  status: 'accepted',
  created_at: '2026-07-01T00:00:00Z',
};

export function PreviewSalaPage() {
  const [withWinner, setWithWinner] = useState(true);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <button
        type="button"
        onClick={() => setWithWinner((v) => !v)}
        className="w-fit rounded bg-slate-800 px-3 py-1 text-sm text-white"
      >
        Toggle winner: {String(withWinner)}
      </button>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <ActiveLotePanel
          remateId="remate-1"
          lote={lote}
          currency="ARS"
          winningOffer={withWinner ? winningOffer : null}
          remateStatus="live"
          viewerRole="comprador"
        />
        <OfferHistoryPanel
          winningOffer={withWinner ? winningOffer : null}
          recentOffers={withWinner ? [winningOffer] : []}
          currency="ARS"
        />
      </div>
    </div>
  );
}
