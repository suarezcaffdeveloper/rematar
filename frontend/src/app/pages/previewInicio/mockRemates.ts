import { useEffect, useState } from 'react';
import type { RemateAuctionType, RemateCategory } from '../../../features/remates/types';

/**
 * Datos de prueba para las vistas previas del inicio del comprador
 * (`/preview-inicio-a`, `/preview-inicio-b`) -- sin backend, mismo criterio que
 * `PreviewSalaPage`. Las fotos salen de `public/rubros` (ya versionadas), así que la
 * vista previa se ve igual sin conexión.
 */

export interface MockRemate {
  id: string;
  title: string;
  category: RemateCategory;
  image: string | null;
  /** `object-position` de la foto -- el mismo archivo se reusa en varios remates. */
  imagePosition?: string;
  location: string;
  startsAt: Date;
  lotes: number;
  connected: number;
  status: 'live' | 'scheduled';
  auctionType: RemateAuctionType;
  /** Solo remates en vivo: el lote que está en el martillo ahora mismo. */
  currentLot?: { number: number; title: string; bid: number; increment: number };
}

function at(daysFromNow: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const HACIENDA = '/rubros/hacienda-ganaderia.webp';
const VEHICULOS = '/rubros/vehiculos.jpg';
const PESADA = '/rubros/maquinaria-pesada.jpg';
const AGRICOLA = '/rubros/maquinaria-agricola.jpg';
const ANTIGUEDADES = '/rubros/antiguedades-coleccionables.jpg';

export const LIVE_REMATES: MockRemate[] = [
  {
    id: 'live-1',
    title: 'Gran remate de hacienda Angus y Hereford',
    category: 'hacienda',
    image: HACIENDA,
    location: 'Cañuelas, Buenos Aires',
    startsAt: at(0, 9),
    lotes: 42,
    connected: 318,
    status: 'live',
    auctionType: 'live',
    currentLot: { number: 12, title: '30 novillos Angus de invernada', bid: 1_850_000, increment: 50_000 },
  },
  {
    id: 'live-2',
    title: 'Flota corporativa: utilitarios y pick-ups',
    category: 'vehiculos',
    image: VEHICULOS,
    location: 'Parque Patricios, CABA',
    startsAt: at(0, 10),
    lotes: 28,
    connected: 204,
    status: 'live',
    auctionType: 'live',
    currentLot: { number: 7, title: 'Toyota Hilux 4x4 2021, 62.000 km', bid: 31_200_000, increment: 200_000 },
  },
  {
    id: 'live-3',
    title: 'Maquinaria vial de constructora en liquidación',
    category: 'maquinaria_pesada_y_agricola',
    image: PESADA,
    location: 'Zárate, Buenos Aires',
    startsAt: at(0, 11),
    lotes: 19,
    connected: 147,
    status: 'live',
    auctionType: 'live',
    currentLot: { number: 3, title: 'Excavadora CAT 320, 6.400 hs', bid: 58_500_000, increment: 500_000 },
  },
  {
    id: 'live-4',
    title: 'Fin de cosecha: tractores y sembradoras',
    category: 'maquinaria_pesada_y_agricola',
    image: AGRICOLA,
    location: 'Venado Tuerto, Santa Fe',
    startsAt: at(0, 12),
    lotes: 35,
    connected: 96,
    status: 'live',
    auctionType: 'live',
    currentLot: { number: 18, title: 'Tractor John Deere 6110J', bid: 41_000_000, increment: 250_000 },
  },
  {
    id: 'live-5',
    title: 'Antigüedades y relojería de una sucesión',
    category: 'arte_antiguedades_y_coleccionables',
    image: ANTIGUEDADES,
    location: 'Recoleta, CABA',
    startsAt: at(0, 13),
    lotes: 64,
    connected: 172,
    status: 'live',
    auctionType: 'live',
    currentLot: { number: 21, title: 'Reloj de pie francés, siglo XIX', bid: 2_400_000, increment: 50_000 },
  },
];

export const SCHEDULED_REMATES: MockRemate[] = [
  {
    id: 'sch-1',
    title: 'Vehículos usados de leasing',
    category: 'vehiculos',
    image: VEHICULOS,
    imagePosition: '20% 60%',
    location: 'Pilar, Buenos Aires',
    startsAt: at(1, 18),
    lotes: 40,
    connected: 0,
    status: 'scheduled',
    auctionType: 'timed',
  },
  {
    id: 'sch-2',
    title: 'Invernada de primavera: terneros y vaquillonas',
    category: 'hacienda',
    image: HACIENDA,
    imagePosition: '80% 50%',
    location: 'Trenque Lauquen, Buenos Aires',
    startsAt: at(1, 10, 30),
    lotes: 26,
    connected: 0,
    status: 'scheduled',
    auctionType: 'live',
  },
  {
    id: 'sch-3',
    title: 'Flota de un contratista rural',
    category: 'maquinaria_pesada_y_agricola',
    image: AGRICOLA,
    imagePosition: '70% 50%',
    location: 'Rafaela, Santa Fe',
    startsAt: at(2, 11),
    lotes: 22,
    connected: 0,
    status: 'scheduled',
    auctionType: 'live',
  },
  {
    id: 'sch-4',
    title: 'Departamentos y cocheras en Palermo',
    category: 'inmuebles',
    image: null,
    location: 'Palermo, CABA',
    startsAt: at(2, 19),
    lotes: 9,
    connected: 0,
    status: 'scheduled',
    auctionType: 'live',
  },
  {
    id: 'sch-5',
    title: 'Colección privada de joyas y numismática',
    category: 'joyas_relojeria_y_numismatica',
    image: null,
    location: 'Online',
    startsAt: at(3, 17, 30),
    lotes: 58,
    connected: 0,
    status: 'scheduled',
    auctionType: 'timed',
  },
  {
    id: 'sch-6',
    title: 'Lanchas y embarcaciones deportivas',
    category: 'nautica_y_aviacion',
    image: null,
    location: 'San Fernando, Buenos Aires',
    startsAt: at(4, 15),
    lotes: 14,
    connected: 0,
    status: 'scheduled',
    auctionType: 'live',
  },
  {
    id: 'sch-7',
    title: 'Stock de tecnología y electrodomésticos',
    category: 'tecnologia_electrodomesticos_y_hogar',
    image: null,
    location: 'Online',
    startsAt: at(5, 12),
    lotes: 120,
    connected: 0,
    status: 'scheduled',
    auctionType: 'timed',
  },
  {
    id: 'sch-8',
    title: 'Arte argentino y objetos de colección',
    category: 'arte_antiguedades_y_coleccionables',
    image: ANTIGUEDADES,
    imagePosition: '30% 40%',
    location: 'San Telmo, CABA',
    startsAt: at(6, 18, 30),
    lotes: 47,
    connected: 0,
    status: 'scheduled',
    auctionType: 'live',
  },
  {
    id: 'sch-9',
    title: 'Camiones, acoplados y carrocerías',
    category: 'maquinaria_pesada_y_agricola',
    image: PESADA,
    imagePosition: '60% 40%',
    location: 'Campana, Buenos Aires',
    startsAt: at(6, 10),
    lotes: 17,
    connected: 0,
    status: 'scheduled',
    auctionType: 'live',
  },
];

export const ALL_MOCK_REMATES: MockRemate[] = [...LIVE_REMATES, ...SCHEDULED_REMATES];

export interface LiveBidState {
  bid: number;
  /** Se incrementa en cada oferta nueva -- sirve de `key` para reiniciar el destello. */
  bump: number;
}

/**
 * Simula ofertas entrando en los remates en vivo: cada remate sube su oferta actual un
 * incremento a intervalos irregulares (2,5 a 6 s). Solo para la vista previa -- en la app
 * real este dato llega por WebSocket.
 */
export function useLiveBids(remates: MockRemate[]): Record<string, LiveBidState> {
  const [bids, setBids] = useState<Record<string, LiveBidState>>(() =>
    Object.fromEntries(remates.map((r) => [r.id, { bid: r.currentLot?.bid ?? 0, bump: 0 }])),
  );

  useEffect(() => {
    const timers: number[] = [];
    let cancelled = false;

    function schedule(remate: MockRemate) {
      const delay = 2500 + Math.random() * 3500;
      const id = window.setTimeout(() => {
        if (cancelled) return;
        setBids((prev) => {
          const current = prev[remate.id];
          return {
            ...prev,
            [remate.id]: { bid: current.bid + (remate.currentLot?.increment ?? 0), bump: current.bump + 1 },
          };
        });
        schedule(remate);
      }, delay);
      timers.push(id);
    }

    remates.filter((r) => r.currentLot).forEach(schedule);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [remates]);

  return bids;
}
