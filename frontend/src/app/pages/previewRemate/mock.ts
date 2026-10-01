import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Lote, LoteStatus, Remate, RemateAuctionType, RemateStatus } from '../../../features/remates/types';

/**
 * Datos de prueba para las vistas previas de la ficha de un remate
 * (`/preview-remate-a`, `/preview-remate-b`) -- sin backend. Usa los tipos reales `Remate`
 * y `Lote`. Parámetros de la URL para ver cada variante:
 * - `?estado=live|scheduled|paused|finished` (por defecto `live`)
 * - `?tipo=timed` (por defecto, remate en vivo tradicional)
 */

const HOUR = 3600 * 1000;
const PHOTO = '/rubros/vehiculos.jpg';

/** Un mismo archivo con encuadres distintos simula varias fotos del lote. */
export const POSITIONS = ['50% 50%', '12% 70%', '88% 30%', '30% 20%'];

interface LoteSeed {
  title: string;
  description: string;
  base: number;
  increment: number;
  reserve: number | null;
  photos: number;
  sold: number;
}

const SEEDS: LoteSeed[] = [
  {
    title: 'Toyota Hilux 4x4 2021, 62.000 km',
    description: 'Cabina doble, caja manual de seis marchas. Único dueño, service oficial al día y cubiertas nuevas.',
    base: 28_000_000,
    increment: 200_000,
    reserve: 30_000_000,
    photos: 4,
    sold: 31_400_000,
  },
  {
    title: 'Ford Ranger XLT 3.2 2020',
    description: 'Automática, cuero, cámara de retroceso. Patentes al día, sin deuda.',
    base: 24_500_000,
    increment: 200_000,
    reserve: null,
    photos: 3,
    sold: 26_100_000,
  },
  {
    title: 'Volkswagen Amarok V6 Highline',
    description: 'Motor V6 3.0 turbodiésel, tracción integral, techo corredizo.',
    base: 33_000_000,
    increment: 250_000,
    reserve: 35_000_000,
    photos: 3,
    sold: 34_250_000,
  },
  {
    title: 'Mercedes-Benz Atego 1726 con carrocería',
    description: 'Camión con caja térmica de 6 metros. 210.000 km, mantenimiento documentado.',
    base: 36_000_000,
    increment: 300_000,
    reserve: 38_000_000,
    photos: 2,
    sold: 39_800_000,
  },
  {
    title: 'Renault Kangoo Express 2019',
    description: 'Utilitario con mampara divisoria y estantes. Ideal reparto urbano.',
    base: 9_800_000,
    increment: 100_000,
    reserve: null,
    photos: 2,
    sold: 10_600_000,
  },
  {
    title: 'Peugeot Partner Confort 1.6 HDi',
    description: 'Furgón de carga diésel con aire acondicionado y puerta lateral.',
    base: 9_200_000,
    increment: 100_000,
    reserve: null,
    photos: 1,
    sold: 9_900_000,
  },
  {
    title: 'Iveco Daily 55-170 furgón',
    description: 'Furgón de 17 m³ con cerramiento reforzado y rampa. 98.000 km.',
    base: 21_000_000,
    increment: 200_000,
    reserve: 22_500_000,
    photos: 3,
    sold: 23_200_000,
  },
  {
    title: 'Chevrolet S10 LTZ 2.8 4x2',
    description: 'Cuero y pantalla multimedia. Con cobertor rígido de caja.',
    base: 19_500_000,
    increment: 150_000,
    reserve: null,
    photos: 2,
    sold: 20_900_000,
  },
];

function lotesFor(remateId: string, status: RemateStatus, auctionType: RemateAuctionType): Lote[] {
  const now = Date.now();
  return SEEDS.map((seed, i) => {
    let lotStatus: LoteStatus = 'pending';
    if (status === 'finished') lotStatus = i === 5 ? 'closed_unsold' : 'closed_sold';
    else if (status === 'live' || status === 'paused') {
      if (auctionType === 'timed') lotStatus = 'open';
      else lotStatus = i < 2 ? 'closed_sold' : i === 2 ? 'open' : 'pending';
    }
    const isOpen = lotStatus === 'open';
    return {
      id: `${remateId}-lote-${i + 1}`,
      remate_id: remateId,
      lot_number: String(i + 1).padStart(2, '0'),
      display_order: i,
      title: seed.title,
      description: seed.description,
      category: 'vehiculos',
      attributes: {},
      images: Array.from({ length: seed.photos }, (_, k) => ({ url: PHOTO, order: k, caption: null })),
      quantity: 1,
      unit_label: null,
      base_price: String(seed.base),
      min_increment: String(seed.increment),
      reserve_price: seed.reserve ? String(seed.reserve) : null,
      final_price: lotStatus === 'closed_sold' ? String(seed.sold) : null,
      status: lotStatus,
      timer_ends_at: isOpen && auctionType === 'timed' ? new Date(now + (30 + i * 9) * HOUR).toISOString() : null,
      timer_paused_remaining_seconds: null,
      timer_auto_close_enabled: auctionType === 'timed',
      round_number: 1,
      created_at: '2026-09-01T00:00:00Z',
    };
  });
}

export interface RemateMock {
  remate: Remate;
  lotes: Lote[];
  /** Solo remates Timed: precio vigente por lote abierto (`null`: todavía sin ofertas). */
  leadingAmounts: Record<string, string | null>;
}

export function useRemateMock(): RemateMock {
  const [params] = useSearchParams();
  const rawStatus = params.get('estado');
  const status: RemateStatus =
    rawStatus === 'scheduled' || rawStatus === 'paused' || rawStatus === 'finished' ? rawStatus : 'live';
  const auctionType: RemateAuctionType = params.get('tipo') === 'timed' ? 'timed' : 'live';

  return useMemo(() => {
    const id = 'remate-demo';
    const startsAt = new Date(Date.now() + (status === 'scheduled' ? 52 : -3) * HOUR).toISOString();
    const remate: Remate = {
      id,
      owner_id: 'empresa-1',
      title: 'Flota corporativa: utilitarios y pick-ups',
      description:
        'Remate de la renovación de flota de una distribuidora con operación en todo el país. Las unidades se pueden ver en el predio los dos días previos, de 9 a 17 h, con turno previo.\n\nTodos los vehículos se entregan con la documentación al día y libres de deuda. La transferencia corre por cuenta del comprador.',
      category: 'vehiculos',
      cover_image_url: PHOTO,
      location: 'Parque Patricios, CABA',
      starts_at: startsAt,
      ends_at: auctionType === 'timed' ? new Date(Date.now() + 96 * HOUR).toISOString() : null,
      status,
      auction_type: auctionType,
      settings: {
        anti_sniping_enabled: auctionType === 'timed',
        anti_sniping_extension_seconds: 60,
        currency: 'ARS',
        lote_timer_seconds: null,
        guarantee_required: true,
        guarantee_amount: '500000',
      },
      cancellation_reason: null,
      cancelled_at: null,
      finished_at: status === 'finished' ? new Date(Date.now() - 20 * HOUR).toISOString() : null,
      created_at: '2026-08-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
    };
    const lotes = lotesFor(id, status, auctionType);
    const leadingAmounts: Record<string, string | null> = {};
    if (auctionType === 'timed') {
      lotes.forEach((lote, i) => {
        leadingAmounts[lote.id] =
          i % 3 === 2 ? null : String(Number(lote.base_price) + Number(lote.min_increment) * (i + 2));
      });
    }
    return { remate, lotes, leadingAmounts };
  }, [status, auctionType]);
}

export function positionFor(index: number): string {
  return POSITIONS[index % POSITIONS.length];
}
