import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { Box } from 'lucide-react';
import { getStatusCopy } from '../../../features/postauction/buyerStatusCopy';
import { STATUS_LABELS } from '../../../features/postauction/labels';
import type { PostAuctionCaseDetail, PostAuctionStatus } from '../../../features/postauction/types';
import { formatCurrency } from '../../../shared/lib/format';

/**
 * Datos de prueba para las vistas previas de "Mis compras" (`/preview-compras-a`,
 * `/preview-compras-b`) -- sin backend. Usan el tipo real `PostAuctionCaseDetail`, así
 * que el diseño solo depende de campos que la API ya entrega. Las fotos salen de
 * `public/rubros`.
 */

export type ComprasGroupId = 'coordinar' | 'pagar' | 'camino' | 'recibidas';

export const COMPRAS_GROUPS: { id: ComprasGroupId; label: string; statuses: PostAuctionStatus[] }[] = [
  { id: 'coordinar', label: 'Por coordinar', statuses: ['adjudicado', 'pendiente_contacto'] },
  { id: 'pagar', label: 'Para pagar', statuses: ['pago_pendiente'] },
  { id: 'camino', label: 'En camino', statuses: ['pago_recibido', 'preparando_entrega', 'enviado'] },
  { id: 'recibidas', label: 'Recibidas', statuses: ['entregado', 'finalizado'] },
];

export function groupOf(status: PostAuctionStatus): ComprasGroupId {
  return COMPRAS_GROUPS.find((g) => g.statuses.includes(status))!.id;
}

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function makeCompra(
  id: string,
  overrides: Partial<PostAuctionCaseDetail> & Pick<PostAuctionCaseDetail, 'lote_title' | 'status' | 'final_price'>,
): PostAuctionCaseDetail {
  return {
    id,
    lote_id: `lote-${id}`,
    lot_number: '1',
    lote_cover_image_url: null,
    remate_id: `remate-${id}`,
    remate_title: 'Remate',
    buyer_id: 'buyer-1',
    buyer_name: 'Martina Ríos',
    rematador_id: 'empresa-1',
    rematador_name: 'Gómez & Asociados',
    base_price: '0',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: ago(3),
    updated_at: ago(1),
    timeline: [],
    documents: [],
    ...overrides,
  };
}

export const COMPRAS: PostAuctionCaseDetail[] = [
  makeCompra('c1', {
    lote_title: 'Toyota Hilux 4x4 2021, 62.000 km',
    lot_number: '7',
    remate_title: 'Flota corporativa: utilitarios y pick-ups',
    lote_cover_image_url: '/rubros/vehiculos.jpg',
    base_price: '28000000',
    final_price: '31400000',
    status: 'pago_pendiente',
    contacted_at: ago(2),
    created_at: ago(3),
  }),
  makeCompra('c2', {
    lote_title: '30 novillos Angus de invernada',
    lot_number: '12',
    remate_title: 'Gran remate de hacienda Angus y Hereford',
    lote_cover_image_url: '/rubros/hacienda-ganaderia.webp',
    base_price: '1500000',
    final_price: '1850000',
    status: 'pendiente_contacto',
    rematador_name: 'Estancias del Sur',
    created_at: ago(1),
  }),
  makeCompra('c3', {
    lote_title: 'Excavadora CAT 320, 6.400 hs',
    lot_number: '3',
    remate_title: 'Maquinaria vial de constructora en liquidación',
    lote_cover_image_url: '/rubros/maquinaria-pesada.jpg',
    base_price: '52000000',
    final_price: '58500000',
    status: 'enviado',
    rematador_name: 'Vial Remates S.A.',
    contacted_at: ago(9),
    payment_at: ago(6),
    shipped_at: ago(2),
    created_at: ago(10),
  }),
  makeCompra('c4', {
    lote_title: 'Tractor John Deere 6110J',
    lot_number: '18',
    remate_title: 'Fin de cosecha: tractores y sembradoras',
    lote_cover_image_url: '/rubros/maquinaria-agricola.jpg',
    base_price: '38000000',
    final_price: '41250000',
    status: 'preparando_entrega',
    rematador_name: 'Agro Subastas',
    contacted_at: ago(8),
    payment_at: ago(4),
    created_at: ago(9),
  }),
  makeCompra('c5', {
    lote_title: 'Reloj de pie francés, siglo XIX',
    lot_number: '21',
    remate_title: 'Antigüedades y relojería de una sucesión',
    lote_cover_image_url: '/rubros/antiguedades-coleccionables.jpg',
    base_price: '2000000',
    final_price: '2400000',
    status: 'pago_recibido',
    rematador_name: 'Casa Belgrano',
    contacted_at: ago(5),
    payment_at: ago(1),
    created_at: ago(6),
  }),
  makeCompra('c6', {
    lote_title: 'Camión Mercedes-Benz Atego 1726',
    lot_number: '14',
    remate_title: 'Flota corporativa: utilitarios y pick-ups',
    lote_cover_image_url: '/rubros/vehiculos.jpg',
    base_price: '36000000',
    final_price: '39800000',
    status: 'pago_pendiente',
    contacted_at: ago(4),
    created_at: ago(5),
  }),
  makeCompra('c7', {
    lote_title: 'Sembradora de siembra directa, 24 surcos',
    lot_number: '22',
    remate_title: 'Fin de cosecha: tractores y sembradoras',
    lote_cover_image_url: '/rubros/maquinaria-agricola.jpg',
    base_price: '12000000',
    final_price: '12900000',
    status: 'adjudicado',
    rematador_name: 'Agro Subastas',
    created_at: ago(0),
  }),
  makeCompra('c8', {
    lote_title: 'Vitrina de roble con bronces, 1920',
    lot_number: '33',
    remate_title: 'Arte argentino y objetos de colección',
    lote_cover_image_url: '/rubros/antiguedades-coleccionables.jpg',
    base_price: '600000',
    final_price: '720000',
    status: 'entregado',
    rematador_name: 'Casa Belgrano',
    contacted_at: ago(21),
    payment_at: ago(19),
    shipped_at: ago(16),
    delivered_at: ago(13),
    created_at: ago(22),
  }),
  makeCompra('c9', {
    lote_title: '12 cabezas de ganado Hereford',
    lot_number: '5',
    remate_title: 'Invernada de primavera: terneros y vaquillonas',
    lote_cover_image_url: '/rubros/hacienda-ganaderia.webp',
    base_price: '980000',
    final_price: '1120000',
    status: 'finalizado',
    rematador_name: 'Estancias del Sur',
    contacted_at: ago(40),
    payment_at: ago(38),
    shipped_at: ago(35),
    delivered_at: ago(33),
    finalized_at: ago(30),
    created_at: ago(41),
  }),
];

export function money(amount: string | number): string {
  return formatCurrency(String(amount), 'ARS');
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
export const formatShortDate = (iso: string) => dateFormatter.format(new Date(iso)).replace('.', '');

const relativeFormatter = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

/** "hoy", "ayer", "hace 3 días", "hace 2 semanas". */
export function timeAgo(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / DAY);
  if (days < 7) return relativeFormatter.format(-days, 'day');
  if (days < 30) return relativeFormatter.format(-Math.round(days / 7), 'week');
  return relativeFormatter.format(-Math.round(days / 30), 'month');
}

export function nextStep(compra: PostAuctionCaseDetail): string {
  return getStatusCopy(compra).nextStepDescription;
}

export { STATUS_LABELS };

/** Texto de estado de una compra (la misma etiqueta que usa la app real). */
export function statusTone(status: PostAuctionStatus): string {
  if (status === 'pago_pendiente') return 'text-warning-700';
  if (status === 'entregado' || status === 'finalizado') return 'text-ink-muted';
  if (status === 'pago_recibido') return 'text-success-700';
  return 'text-brand-700';
}

/** Miniatura cuadrada: foto del lote si la tiene, ícono si no. */
export function CompraThumb({ compra, className = '' }: { compra: PostAuctionCaseDetail; className?: string }) {
  if (compra.lote_cover_image_url) {
    return <img src={compra.lote_cover_image_url} alt="" className={`object-cover ${className}`} />;
  }
  return (
    <span className={`flex items-center justify-center bg-brand-50 text-brand-600 ${className}`}>
      <Box className="h-1/2 w-1/2" strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

/** Número que sube de 0 al valor final al montarse (sin animación con movimiento reducido). */
export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <span className="tabular-nums">{format(shown)}</span>;
}
