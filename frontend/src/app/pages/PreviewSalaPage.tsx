import { useState } from 'react';
import { ActiveLotePanel } from '../../features/sala/components/ActiveLotePanel';
import { SalaBidPanel } from '../../features/sala/components/SalaBidPanel';
import { SalaSidePanel } from '../../features/sala/components/SalaSidePanel';
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
    // Mismo contenedor exterior que `AppLayout` usa para `SalaPage` en modo foco
    // (`max-w-[110rem]`, ver `AppLayout.tsx`) -- sin esto, esta vista previa corre en un
    // ancho angosto que no representa el de la Sala real, y cualquier comparación de
    // tamaños/proporciones contra ella queda mal calibrada.
    <div className="mx-auto min-h-screen w-full max-w-[110rem] bg-slate-50 px-3 py-4 sm:px-4 lg:px-6">
      <div className="mx-auto flex w-full max-w-[85rem] flex-col gap-4 font-display">
        <button
          type="button"
          onClick={() => setWithWinner((v) => !v)}
          className="w-fit rounded bg-slate-800 px-3 py-1 text-sm text-white"
        >
          Toggle winner: {String(withWinner)}
        </button>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_380px] xl:gap-14">
          <ActiveLotePanel lote={lote} />
          <div className="flex flex-col gap-6">
            <SalaBidPanel
              remateId="remate-1"
              lote={lote}
              currency="ARS"
              winningOffer={withWinner ? winningOffer : null}
              remateStatus="live"
              viewerRole="comprador"
            />
            <hr className="border-t border-line" />
            <SalaSidePanel
              recentOffers={withWinner ? [winningOffer] : []}
              currency="ARS"
              remateId="remate-1"
              subscribeToRealtime={() => () => {}}
              currentUserId={undefined}
              connectedUsers={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
