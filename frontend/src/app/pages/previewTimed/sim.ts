import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Lote, LoteStatus, Remate, RemateCategory } from '../../../features/remates/types';

/**
 * Simulación para las vistas previas de la Sala de un remate Timed
 * (`/preview-timed-a`, `/preview-timed-b`) -- sin backend. Usa los tipos reales `Remate`
 * y `Lote`. Varios lotes abiertos a la vez, cada uno con su propio cierre; las ofertas se
 * pueden hacer de verdad (quedan en memoria) y cada tanto entra una oferta de otro
 * comprador. Parámetros de la URL:
 * - `?modo=normal|lider|garantia|anonimo` (por defecto `normal`): quién mira la pantalla.
 * - `?largo=1`: título y descripción larguísimos en el lote que se ve al entrar.
 * - `?vivo=0`: sin ofertas de otros compradores.
 * - `?lotes=N`: cantidad de lotes (por defecto 9, hasta 40) para ver cómo escala la lista.
 */

export type Viewer = 'normal' | 'lider' | 'garantia' | 'anonimo';

export interface SimOffer {
  id: string;
  amount: number;
  /** `true`: la hizo quien mira la pantalla. */
  mine: boolean;
  /** Nombre que se le muestra a los demás (anónimo: nunca el real). */
  bidder: string;
  at: number;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

interface Seed {
  title: string;
  description: string;
  category: RemateCategory;
  photo: string;
  base: number;
  increment: number;
  /** Cuánto falta para que cierre, en ms (`null`: todavía no abrió). */
  closesIn: number | null;
  status: LoteStatus;
  bids: number;
  sold?: number;
}

const SEEDS: Seed[] = [
  {
    title: 'Toyota Hilux 4x4 2021, 62.000 km',
    description:
      'Cabina doble, caja manual de seis marchas. Único dueño, service oficial al día y cubiertas nuevas. Se entrega con la documentación completa y sin deuda de patentes.',
    category: 'vehiculos',
    photo: '/rubros/vehiculos.jpg',
    base: 28_000_000,
    increment: 200_000,
    closesIn: 4 * MIN + 20_000,
    status: 'open',
    bids: 7,
  },
  {
    title: 'Retroexcavadora JCB 3CX 2016',
    description: 'Cuatro en uno, 5.800 horas de trabajo. Martillo hidráulico incluido. Se puede ver funcionando en el predio.',
    category: 'maquinaria_pesada_y_agricola',
    photo: '/rubros/maquinaria-pesada.jpg',
    base: 41_000_000,
    increment: 500_000,
    closesIn: 52 * MIN,
    status: 'open',
    bids: 4,
  },
  {
    title: 'Cosechadora Case IH 2388',
    description: 'Plataforma de 25 pies, monitor de rendimiento. Cubiertas en muy buen estado, mantenimiento al día.',
    category: 'maquinaria_pesada_y_agricola',
    photo: '/rubros/maquinaria-agricola.jpg',
    base: 52_000_000,
    increment: 750_000,
    closesIn: 3 * HOUR + 10 * MIN,
    status: 'open',
    bids: 0,
  },
  {
    title: 'Lote de 40 vaquillonas Angus',
    description: 'Preñadas de servicio de otoño, con sanidad al día. Se entregan en el campo de origen, con guía y marca.',
    category: 'hacienda',
    photo: '/rubros/hacienda-ganaderia.webp',
    base: 18_500_000,
    increment: 250_000,
    closesIn: 26 * HOUR,
    status: 'open',
    bids: 3,
  },
  {
    title: 'Reloj de péndulo inglés, siglo XIX',
    description: 'Caja de roble tallado, mecanismo restaurado por un relojero matriculado. Incluye llave y certificado.',
    category: 'arte_antiguedades_y_coleccionables',
    photo: '/rubros/antiguedades-coleccionables.jpg',
    base: 1_800_000,
    increment: 50_000,
    closesIn: 28 * HOUR,
    status: 'open',
    bids: 2,
  },
  {
    title: 'Ford Ranger XLT 3.2 2020',
    description: 'Automática, cuero, cámara de retroceso. Patentes al día, sin deuda.',
    category: 'vehiculos',
    photo: '/rubros/vehiculos.jpg',
    base: 24_500_000,
    increment: 200_000,
    closesIn: 2 * 24 * HOUR + 3 * HOUR,
    status: 'open',
    bids: 0,
  },
  {
    title: 'Tractor John Deere 6110J',
    description: 'Doble tracción, 4.100 horas. Con hidráulicos traseros y toma de fuerza de 540/1000.',
    category: 'maquinaria_pesada_y_agricola',
    photo: '/rubros/maquinaria-agricola.jpg',
    base: 36_000_000,
    increment: 400_000,
    closesIn: 3 * 24 * HOUR,
    status: 'open',
    bids: 5,
  },
  {
    title: 'Mercedes-Benz Atego 1726 con carrocería',
    description: 'Camión con caja térmica de 6 metros. 210.000 km, mantenimiento documentado.',
    category: 'vehiculos',
    photo: '/rubros/maquinaria-pesada.jpg',
    base: 36_000_000,
    increment: 300_000,
    closesIn: null,
    status: 'pending',
    bids: 0,
  },
  {
    title: 'Volkswagen Amarok V6 Highline',
    description: 'Motor V6 3.0 turbodiésel, tracción integral, techo corredizo.',
    category: 'vehiculos',
    photo: '/rubros/vehiculos.jpg',
    base: 33_000_000,
    increment: 250_000,
    closesIn: null,
    status: 'closed_sold',
    bids: 9,
    sold: 34_250_000,
  },
  {
    title: 'Mesa de billar de roble, 1930',
    description: 'Paño nuevo, patas torneadas. Con sus tacos y bolas originales.',
    category: 'arte_antiguedades_y_coleccionables',
    photo: '/rubros/antiguedades-coleccionables.jpg',
    base: 900_000,
    increment: 25_000,
    closesIn: null,
    status: 'closed_unsold',
    bids: 0,
  },
];

const LONG_TITLE =
  'Toyota Hilux 4x4 SRX 2.8 TDI 2021 cabina doble automática con cúpula, barras antivuelco y equipamiento completo de fábrica';
const LONG_DESCRIPTION =
  'Cabina doble, caja automática de seis marchas. Único dueño, service oficial al día con todos los comprobantes y cubiertas nuevas colocadas hace dos meses. Se entrega con la documentación completa, verificación policial vigente y sin deuda de patentes ni multas.\n\nEl vehículo se puede ver en el predio de lunes a viernes de 9 a 17 h, con turno previo. La transferencia corre por cuenta del comprador y debe realizarse dentro de los diez días posteriores a la adjudicación. No se aceptan reclamos por el estado del vehículo una vez adjudicado: se recomienda la inspección previa.';

const BIDDERS = ['Comprador verificado', 'Comprador verificado', 'Comprador verificado'];

export interface TimedSim {
  remate: Remate;
  lotes: Lote[];
  viewer: Viewer;
  offersByLote: Record<string, SimOffer[]>;
  /** Precio vigente por lote abierto (`null`: todavía sin ofertas). */
  leadingAmounts: Record<string, number | null>;
  /** `true` si el que mira va liderando ese lote. */
  isLeading: (loteId: string) => boolean;
  /** `true` si ofertó en ese lote alguna vez. */
  hasBid: (loteId: string) => boolean;
  minimumFor: (lote: Lote) => number;
  placeBid: (loteId: string, amount: number) => void;
  /** Lotes a los que se les sumó tiempo por una oferta en el final (anti-sniping). */
  extendedIds: Set<string>;
  /** Id de la última oferta ajena que entró (para animarla). */
  lastIncomingId: string | null;
}

function buildLotes(count: number): Lote[] {
  const now = Date.now();
  const created = '2026-09-20T00:00:00Z';
  return Array.from({ length: count }, (_, i) => {
    const seed = SEEDS[i % SEEDS.length];
    const round = Math.floor(i / SEEDS.length);
    const isOpen = seed.status === 'open';
    const closesIn = seed.closesIn === null ? null : seed.closesIn + round * 7 * HOUR + round * 13 * MIN;
    const photoCount = 2 + (i % 3);
    return {
      id: `lote-${i + 1}`,
      remate_id: 'remate-demo',
      lot_number: String(i + 1).padStart(2, '0'),
      display_order: i,
      title: seed.title,
      description: seed.description,
      category: seed.category,
      attributes: {},
      images: Array.from({ length: photoCount }, (_, k) => ({ url: seed.photo, order: k, caption: null })),
      quantity: 1,
      unit_label: null,
      base_price: String(seed.base),
      min_increment: String(seed.increment),
      reserve_price: null,
      final_price: seed.status === 'closed_sold' ? String(seed.sold ?? seed.base) : null,
      status: seed.status,
      timer_ends_at: isOpen && closesIn !== null ? new Date(now + closesIn).toISOString() : null,
      timer_paused_remaining_seconds: null,
      timer_auto_close_enabled: true,
      round_number: 1,
      created_at: created,
    };
  });
}

function seedOffers(lotes: Lote[], viewer: Viewer): Record<string, SimOffer[]> {
  const now = Date.now();
  const out: Record<string, SimOffer[]> = {};
  lotes.forEach((lote, i) => {
    const seed = SEEDS[i % SEEDS.length];
    const offers: SimOffer[] = [];
    for (let k = 0; k < seed.bids; k += 1) {
      offers.push({
        id: `${lote.id}-o${k}`,
        amount: Number(lote.base_price) + Number(lote.min_increment) * (k + 1),
        mine: false,
        bidder: BIDDERS[k % BIDDERS.length],
        at: now - (seed.bids - k) * 37 * MIN,
      });
    }
    // En el modo "lider", quien mira va primero en el lote de la Hilux.
    if (viewer === 'lider' && i === 0 && offers.length > 0) {
      offers[offers.length - 1] = { ...offers[offers.length - 1], mine: true };
    }
    // Y en el modo normal ya ofertó (y lo superaron) en el segundo lote.
    if (viewer === 'normal' && i === 1 && offers.length > 1) {
      offers[offers.length - 2] = { ...offers[offers.length - 2], mine: true };
    }
    out[lote.id] = offers;
  });
  return out;
}

export function useTimedSim(): TimedSim {
  const [params] = useSearchParams();
  const rawViewer = params.get('modo');
  const viewer: Viewer =
    rawViewer === 'lider' || rawViewer === 'garantia' || rawViewer === 'anonimo' ? rawViewer : 'normal';
  const largo = params.get('largo') === '1';
  const vivo = params.get('vivo') !== '0';
  const count = Math.min(40, Math.max(4, Number(params.get('lotes')) || 9));

  const baseLotes = useMemo(() => {
    const lotes = buildLotes(count);
    if (largo) {
      lotes[0] = { ...lotes[0], title: LONG_TITLE, description: LONG_DESCRIPTION };
    }
    return lotes;
  }, [count, largo]);

  const [offersByLote, setOffersByLote] = useState(() => seedOffers(baseLotes, viewer));
  const [extraMs, setExtraMs] = useState<Record<string, number>>({});
  const [extendedIds, setExtendedIds] = useState<Set<string>>(new Set());
  const [lastIncomingId, setLastIncomingId] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    setOffersByLote(seedOffers(baseLotes, viewer));
    setExtraMs({});
    setExtendedIds(new Set());
  }, [baseLotes, viewer]);

  const lotes = useMemo(
    () =>
      baseLotes.map((lote) => {
        const extra = extraMs[lote.id] ?? 0;
        if (extra === 0 || lote.timer_ends_at === null) return lote;
        return { ...lote, timer_ends_at: new Date(new Date(lote.timer_ends_at).getTime() + extra).toISOString() };
      }),
    [baseLotes, extraMs],
  );

  const remate = useMemo<Remate>(
    () => ({
      id: 'remate-demo',
      owner_id: 'empresa-1',
      title: 'Remate multirrubro de cierre de temporada',
      description:
        'Vehículos, maquinaria, hacienda y antigüedades de distintos vendedores. Cada lote cierra en su propio horario: elegí los que te interesan y ofertá hasta que se termine el tiempo.',
      category: 'vehiculos',
      cover_image_url: '/rubros/vehiculos.jpg',
      location: 'Parque Patricios, CABA',
      starts_at: new Date(Date.now() - 30 * HOUR).toISOString(),
      ends_at: new Date(Date.now() + 4 * 24 * HOUR).toISOString(),
      status: 'live',
      auction_type: 'timed',
      settings: {
        anti_sniping_enabled: true,
        anti_sniping_extension_seconds: 60,
        currency: 'ARS',
        lote_timer_seconds: null,
        guarantee_required: true,
        guarantee_amount: '500000',
      },
      cancellation_reason: null,
      cancelled_at: null,
      finished_at: null,
      created_at: '2026-08-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
    }),
    [],
  );

  const leadingAmounts = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const lote of lotes) {
      const offers = offersByLote[lote.id] ?? [];
      map[lote.id] = offers.length > 0 ? Math.max(...offers.map((o) => o.amount)) : null;
    }
    return map;
  }, [lotes, offersByLote]);

  const topOffer = useCallback(
    (loteId: string): SimOffer | null => {
      const offers = offersByLote[loteId] ?? [];
      if (offers.length === 0) return null;
      return offers.reduce((best, o) => (o.amount > best.amount ? o : best));
    },
    [offersByLote],
  );

  const isLeading = useCallback((loteId: string) => topOffer(loteId)?.mine === true, [topOffer]);
  const hasBid = useCallback((loteId: string) => (offersByLote[loteId] ?? []).some((o) => o.mine), [offersByLote]);

  const minimumFor = useCallback(
    (lote: Lote) => {
      const current = leadingAmounts[lote.id];
      return current === null || current === undefined
        ? Number(lote.base_price)
        : current + Number(lote.min_increment);
    },
    [leadingAmounts],
  );

  const extend = useCallback(
    (lote: Lote) => {
      if (lote.timer_ends_at === null) return;
      const remaining = new Date(lote.timer_ends_at).getTime() - Date.now();
      if (remaining > 60_000) return;
      setExtraMs((prev) => ({ ...prev, [lote.id]: (prev[lote.id] ?? 0) + 60_000 }));
      setExtendedIds((prev) => new Set(prev).add(lote.id));
      window.setTimeout(
        () =>
          setExtendedIds((prev) => {
            const next = new Set(prev);
            next.delete(lote.id);
            return next;
          }),
        4000,
      );
    },
    [],
  );

  const placeBid = useCallback(
    (loteId: string, amount: number) => {
      const lote = lotes.find((l) => l.id === loteId);
      if (!lote) return;
      counter.current += 1;
      const offer: SimOffer = {
        id: `mine-${counter.current}`,
        amount,
        mine: true,
        bidder: 'Vos',
        at: Date.now(),
      };
      setOffersByLote((prev) => ({ ...prev, [loteId]: [...(prev[loteId] ?? []), offer] }));
      extend(lote);
    },
    [lotes, extend],
  );

  // Cada tanto entra una oferta de otro comprador en algún lote abierto.
  const lotesRef = useRef(lotes);
  lotesRef.current = lotes;
  const leadingRef = useRef(leadingAmounts);
  leadingRef.current = leadingAmounts;
  useEffect(() => {
    if (!vivo) return;
    const interval = window.setInterval(() => {
      const open = lotesRef.current.filter((l) => l.status === 'open');
      if (open.length === 0) return;
      const lote = open[Math.floor(Math.random() * open.length)];
      const current = leadingRef.current[lote.id];
      const amount =
        (current === null || current === undefined ? Number(lote.base_price) : current) + Number(lote.min_increment);
      counter.current += 1;
      const offer: SimOffer = {
        id: `other-${counter.current}`,
        amount,
        mine: false,
        bidder: BIDDERS[counter.current % BIDDERS.length],
        at: Date.now(),
      };
      setOffersByLote((prev) => ({ ...prev, [lote.id]: [...(prev[lote.id] ?? []), offer] }));
      setLastIncomingId(offer.id);
      extend(lote);
    }, 16_000);
    return () => window.clearInterval(interval);
  }, [vivo, extend]);

  return {
    remate,
    lotes,
    viewer,
    offersByLote,
    leadingAmounts,
    isLeading,
    hasBid,
    minimumFor,
    placeBid,
    extendedIds,
    lastIncomingId,
  };
}

export function photoPosition(index: number): string {
  return ['50% 50%', '12% 70%', '88% 30%', '30% 20%'][index % 4];
}
