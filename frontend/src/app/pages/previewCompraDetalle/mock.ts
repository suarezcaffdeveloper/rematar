import { STATUS_ORDER } from '../../../features/postauction/labels';
import type {
  PostAuctionCaseDetail,
  PostAuctionStatus,
  TimelineEntry,
} from '../../../features/postauction/types';

/**
 * Datos de prueba para las vistas previas del detalle de una compra
 * (`/preview-detalle-a`, `/preview-detalle-b`) -- sin backend. Arma un
 * `PostAuctionCaseDetail` real (mismo tipo que devuelve `GET /postauction/mis-compras/{id}`)
 * con el historial completo hasta el estado pedido, así se puede revisar el diseño en los
 * ocho estados con `?estado=`.
 */

const DAY = 24 * 3600 * 1000;
const STEP_DAYS = 1.6;

export interface MockImage {
  url: string;
  position: string;
}

/** Fotos del lote (en la app real llegan por `useLote`, recién al abrir la galería). */
export const DETALLE_IMAGES: MockImage[] = [
  { url: '/rubros/maquinaria-agricola.jpg', position: '50% 50%' },
  { url: '/rubros/maquinaria-agricola.jpg', position: '15% 80%' },
  { url: '/rubros/maquinaria-agricola.jpg', position: '85% 25%' },
];

export function parseEstado(raw: string | null): PostAuctionStatus {
  return STATUS_ORDER.includes(raw as PostAuctionStatus) ? (raw as PostAuctionStatus) : 'preparando_entrega';
}

const STEP_NOTES: Partial<Record<PostAuctionStatus, string>> = {
  pago_pendiente: 'Te pasé los datos de la cuenta por mail. El pago se hace por transferencia dentro de las 72 horas.',
  preparando_entrega:
    'Estamos cargando la máquina en el camión. La retirás del campo el jueves por la mañana, avisanos si preferís otro día.',
  enviado: 'Salió el camión. El chofer te llama una hora antes de llegar.',
};

export function buildDetalle(status: PostAuctionStatus): PostAuctionCaseDetail {
  const index = STATUS_ORDER.indexOf(status);
  const start = Date.now() - (index * STEP_DAYS + 0.6) * DAY;
  const at = (step: number) => new Date(start + step * STEP_DAYS * DAY).toISOString();

  const timeline: TimelineEntry[] = [];
  let n = 0;
  const push = (entry: Omit<TimelineEntry, 'id' | 'actor_id' | 'actor_role'>) =>
    timeline.push({ id: `t${n++}`, actor_id: null, actor_role: null, ...entry });

  push({
    occurred_at: at(0),
    actor_name: null,
    action: 'case_created',
    previous_status: null,
    new_status: 'adjudicado',
    note: null,
  });
  for (let i = 1; i <= index; i++) {
    const step = STATUS_ORDER[i];
    push({
      occurred_at: at(i),
      actor_name: 'Agro Subastas',
      action: 'status_changed',
      previous_status: STATUS_ORDER[i - 1],
      new_status: step,
      note: null,
    });
    const note = STEP_NOTES[step];
    if (note) {
      push({
        occurred_at: new Date(new Date(at(i)).getTime() + 3600 * 1000).toISOString(),
        actor_name: 'Lucía Fernández',
        action: 'note_added',
        previous_status: null,
        new_status: null,
        note,
      });
    }
  }
  timeline.reverse();

  const dateOf = (s: PostAuctionStatus) => (STATUS_ORDER.indexOf(s) <= index ? at(STATUS_ORDER.indexOf(s)) : null);

  return {
    id: 'detalle-1',
    lote_id: 'lote-18',
    lot_number: '18',
    lote_title: 'Tractor John Deere 6110J, cabinado',
    lote_cover_image_url: DETALLE_IMAGES[0].url,
    remate_id: 'remate-4',
    remate_title: 'Fin de cosecha: tractores y sembradoras',
    buyer_id: 'buyer-1',
    buyer_name: 'Martina Ríos',
    rematador_id: 'empresa-1',
    rematador_name: 'Agro Subastas',
    empresa_name: 'Agro Subastas',
    operador_name: 'Lucía Fernández',
    base_price: '38000000',
    final_price: '41250000',
    status,
    contacted_at: dateOf('pendiente_contacto'),
    payment_at: dateOf('pago_recibido'),
    shipped_at: dateOf('enviado'),
    delivered_at: dateOf('entregado'),
    finalized_at: dateOf('finalizado'),
    notes: null,
    created_at: at(0),
    updated_at: at(index),
    timeline,
    documents: [],
  };
}

/** Fecha en la que la compra llegó a cada paso (o `null` si todavía no llegó). */
export function stepDate(detalle: PostAuctionCaseDetail, step: PostAuctionStatus): string | null {
  const entry = detalle.timeline.find((e) => e.new_status === step && e.action !== 'note_added');
  return entry?.occurred_at ?? null;
}

/**
 * Reparte las entradas del historial entre los pasos del proceso: cada una cuelga del paso
 * en el que estaba la compra cuando ocurrió (un cambio de estado pertenece al paso al que
 * entró; una observación, al paso vigente en ese momento). Devuelve las entradas de cada
 * paso de la más vieja a la más nueva.
 */
export function groupTimelineByStep(timeline: TimelineEntry[]): Record<PostAuctionStatus, TimelineEntry[]> {
  const groups = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as TimelineEntry[]])) as Record<
    PostAuctionStatus,
    TimelineEntry[]
  >;
  let current: PostAuctionStatus = 'adjudicado';
  const chronological = [...timeline].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  for (const entry of chronological) {
    if (entry.new_status) current = entry.new_status;
    groups[current].push(entry);
  }
  return groups;
}
