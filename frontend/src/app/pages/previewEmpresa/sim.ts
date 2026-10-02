import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ACTIVE_LOTE, DESIERTO_LOTES, UPCOMING_LOTES, type MockLote } from '../previewConsola/mockData';
import { useConsolaSim } from '../previewConsola/useConsolaSim';

/**
 * Simulación del panel de la EMPRESA dentro de un remate en vivo (sin backend). Se apoya en
 * `useConsolaSim` (ofertas, chat y conectados llegan solos) y le suma lo que la empresa
 * necesita para supervisar: historial de lotes cerrados, línea de tiempo de ofertas, avisos y
 * proyecciones. La empresa no opera: en la simulación el "martillero" adjudica y abre el
 * siguiente lote solo, para que los gráficos se muevan.
 * `?martillero=0` (sin operador conectado), `?estado=pausado`, `?stream=0` (sin transmisión).
 */

const MIN = 60_000;

export interface SoldRecord {
  number: number;
  title: string;
  base: number;
  final: number;
  openedAt: number;
  closedAt: number;
  offers: number;
}

export interface UnsoldRecord {
  number: number;
  title: string;
  base: number;
  openedAt: number;
  closedAt: number;
}

export type EventKind = 'opened' | 'sold' | 'unsold';

export interface TimelineEvent {
  id: string;
  kind: EventKind;
  number: number;
  title: string;
  at: number;
  price?: number;
}

export interface Bucket {
  t: number;
  count: number;
}

export type AlertLevel = 'critical' | 'warning' | 'info';

export interface PanelAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
}

export type LoteCellStatus = 'sold' | 'open' | 'pending' | 'unsold';

export interface LoteCell {
  number: number;
  title: string;
  status: LoteCellStatus;
  base: number;
  final?: number;
}

const rand = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;

function seedSold(now: number): SoldRecord[] {
  return [
    { number: 1, title: 'Lote de 15 Monitores Dell Professional de 24" FHD', base: 1_200_000, final: 1_350_000, openedAt: now - 64 * MIN, closedAt: now - 49 * MIN, offers: 18 },
    { number: 2, title: 'Servidor de Rack HP ProLiant DL380 Gen10', base: 2_700_000, final: 3_100_000, openedAt: now - 49 * MIN, closedAt: now - 33 * MIN, offers: 24 },
    { number: 4, title: 'Combo de Conectividad: 4 Switches Cisco Catalyst 3850', base: 1_700_000, final: 1_950_000, openedAt: now - 27 * MIN, closedAt: now - 12 * MIN, offers: 17 },
  ];
}

function seedUnsold(now: number): UnsoldRecord[] {
  return [
    { number: 3, title: DESIERTO_LOTES[0].title, base: DESIERTO_LOTES[0].basePrice, openedAt: now - 33 * MIN, closedAt: now - 27 * MIN },
    { number: 5, title: DESIERTO_LOTES[1].title, base: DESIERTO_LOTES[1].basePrice, openedAt: now - 12 * MIN, closedAt: now - 5 * MIN },
  ];
}

/** Marca de tiempo de cada oferta de los lotes ya cerrados: más densas hacia el cierre. */
function seedBidLog(sold: SoldRecord[], liveOfferTimes: number[]): number[] {
  const log: number[] = [];
  sold.forEach((record) => {
    const span = record.closedAt - record.openedAt;
    for (let i = 0; i < record.offers; i += 1) {
      const u = (i + 0.5) / record.offers;
      log.push(record.openedAt + span * Math.pow(u, 0.7) + (rand(record.number * 100 + i) - 0.5) * 8000);
    }
  });
  return [...log, ...liveOfferTimes].sort((a, b) => a - b);
}

function bucketize(log: number[], now: number, minutes: number): Bucket[] {
  const currentMinute = Math.floor(now / MIN) * MIN;
  const buckets: Bucket[] = [];
  for (let i = minutes - 1; i >= 0; i -= 1) buckets.push({ t: currentMinute - i * MIN, count: 0 });
  const first = buckets[0].t;
  log.forEach((at) => {
    const index = Math.floor((at - first) / MIN);
    if (index >= 0 && index < minutes) buckets[index].count += 1;
  });
  return buckets;
}

export interface BuyerQuestion {
  id: number;
  author: string;
  text: string;
  at: number;
  /** Respuesta de la empresa, si ya la dio. */
  answer: { text: string; at: number } | null;
}

export function useEmpresaSim() {
  const [params] = useSearchParams();
  const operatorOnline = params.get('martillero') !== '0';
  const streamOn = params.get('stream') !== '0';
  const wantPaused = params.get('estado') === 'pausado';

  const base = useConsolaSim();
  const { now, active, upcoming, desiertos, offers, connected, state } = base;

  const [mountedAt] = useState(() => Date.now());
  const [sold, setSold] = useState<SoldRecord[]>(() => seedSold(Date.now()));
  const [unsold, setUnsold] = useState<UnsoldRecord[]>(() => seedUnsold(Date.now()));
  const [events, setEvents] = useState<TimelineEvent[]>(() => {
    const t = Date.now();
    const list: TimelineEvent[] = [];
    seedSold(t).forEach((r) => {
      list.push({ id: `o${r.number}`, kind: 'opened', number: r.number, title: r.title, at: r.openedAt });
      list.push({ id: `s${r.number}`, kind: 'sold', number: r.number, title: r.title, at: r.closedAt, price: r.final });
    });
    seedUnsold(t).forEach((r) => {
      list.push({ id: `o${r.number}`, kind: 'opened', number: r.number, title: r.title, at: r.openedAt });
      list.push({ id: `u${r.number}`, kind: 'unsold', number: r.number, title: r.title, at: r.closedAt });
    });
    list.push({ id: `o${ACTIVE_LOTE.number}`, kind: 'opened', number: ACTIVE_LOTE.number, title: ACTIVE_LOTE.title, at: t - 5 * MIN });
    return list.sort((a, b) => a.at - b.at);
  });
  const [bidLog, setBidLog] = useState<number[]>(() => {
    const t = Date.now();
    return seedBidLog(seedSold(t), base.offers.map((o) => o.at));
  });
  const [connHistory, setConnHistory] = useState<number[]>(() =>
    Array.from({ length: 48 }, (_, i) => Math.round(30 + i * 0.35 + (rand(i) - 0.5) * 6)),
  );

  // Preguntas de compradores: todo mensaje con "?" que no sea de la empresa o el martillero.
  const [dismissed, setDismissed] = useState<number[]>([]);
  const questions: BuyerQuestion[] = useMemo(() => {
    const replies = new Map<number, { text: string; at: number }>();
    base.chat.forEach((m) => {
      if (m.replyTo !== undefined) replies.set(m.replyTo, { text: m.text, at: m.at });
    });
    return base.chat
      .filter((m) => !m.fromOperator && m.text.includes('?') && !dismissed.includes(m.id))
      .map((m) => ({ id: m.id, author: m.author, text: m.text, at: m.at, answer: replies.get(m.id) ?? null }));
  }, [base.chat, dismissed]);
  const pendingQuestions = questions.filter((q) => q.answer === null);
  const answerQuestion = (id: number, text: string) => base.sendChat(text, { author: 'Empresa', replyTo: id });
  const dismissQuestion = (id: number) => setDismissed((list) => [...list, id]);

  const baseRef = useRef(base);
  baseRef.current = base;
  const openedAtRef = useRef(mountedAt);
  const lastBidId = useRef<number | null>(offers[0]?.id ?? null);
  const lastActiveId = useRef<string | null>(active?.id ?? null);
  const pauseRequested = useRef(false);

  // Un `?estado=pausado` pausa el remate una sola vez, apenas monta.
  useEffect(() => {
    if (wantPaused && !pauseRequested.current) {
      pauseRequested.current = true;
      baseRef.current.setPendingConfirm('pause');
    }
  }, [wantPaused]);
  useEffect(() => {
    if (base.pendingConfirm === 'pause' && pauseRequested.current) base.confirm();
  }, [base.pendingConfirm, base]);

  // Cada oferta nueva entra al registro que alimenta el gráfico de pulso.
  useEffect(() => {
    const latest = offers[0];
    if (latest && latest.id !== lastBidId.current) {
      lastBidId.current = latest.id;
      setBidLog((log) => [...log, latest.at]);
    }
  }, [offers]);

  // Cuando se abre un lote, queda en la línea de tiempo.
  useEffect(() => {
    if (active && active.id !== lastActiveId.current) {
      lastActiveId.current = active.id;
      openedAtRef.current = Date.now();
      setEvents((list) => [...list, { id: `o${active.number}-${Date.now()}`, kind: 'opened', number: active.number, title: active.title, at: Date.now() }]);
    }
  }, [active]);

  // Adjudicación simulada: el "martillero" cierra y abre el siguiente.
  const secondsSinceLastOffer = base.secondsSinceLastOffer;
  useEffect(() => {
    if (!operatorOnline || state !== 'live' || !active || !base.winning) return;
    if (Date.now() - openedAtRef.current > 80_000 && (secondsSinceLastOffer ?? 0) >= 6) base.adjudicate();
  }, [now, operatorOnline, state, active, base, secondsSinceLastOffer]);
  useEffect(() => {
    if (base.pendingConfirm === 'recent-offer') base.confirm();
  }, [base.pendingConfirm, base]);
  useEffect(() => {
    const info = base.adjudicated;
    if (!info) return;
    const t = Date.now();
    setSold((list) => [
      ...list,
      {
        number: info.number,
        title: info.title,
        base: ACTIVE_LOTE.number === info.number ? ACTIVE_LOTE.basePrice : (UPCOMING_LOTES.find((l) => l.number === info.number)?.basePrice ?? info.price),
        final: info.price,
        openedAt: openedAtRef.current,
        closedAt: t,
        offers: bidLog.filter((at) => at >= openedAtRef.current).length,
      },
    ]);
    setEvents((list) => [...list, { id: `s${info.number}-${t}`, kind: 'sold', number: info.number, title: info.title, at: t, price: info.price }]);
    base.dismissAdjudicated();
    const timer = window.setTimeout(() => baseRef.current.openNext(), 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.adjudicated]);

  // Lotes cerrados sin ofertas por la simulación (no ocurre salvo que el martillero lo haga).
  useEffect(() => {
    const known = new Set(unsold.map((u) => u.number));
    desiertos.forEach((lote) => {
      if (known.has(lote.number)) return;
      const t = Date.now();
      setUnsold((list) => [...list, { number: lote.number, title: lote.title, base: lote.basePrice, openedAt: openedAtRef.current, closedAt: t }]);
      setEvents((list) => [...list, { id: `u${lote.number}-${t}`, kind: 'unsold', number: lote.number, title: lote.title, at: t }]);
    });
  }, [desiertos, unsold]);

  // Muestra de conectados cada ~5 s para la línea de audiencia.
  const slot = Math.floor(now / 5000);
  useEffect(() => {
    setConnHistory((list) => [...list, connected].slice(-60));
  }, [slot, connected]);

  const buckets = useMemo(() => bucketize(bidLog, now, 60), [bidLog, now]);
  const totalOfertas = bidLog.length;
  const last5 = buckets.slice(-5);
  const ofertasPerMin = Math.round((last5.reduce((sum, b) => sum + b.count, 0) / 5) * 10) / 10;

  const revenue = sold.reduce((sum, r) => sum + r.final, 0);
  const soldBase = sold.reduce((sum, r) => sum + r.base, 0);
  const upliftPct = soldBase > 0 ? ((revenue - soldBase) / soldBase) * 100 : 0;
  const avgTicket = sold.length > 0 ? revenue / sold.length : 0;
  const queueBase = upcoming.reduce((sum, l) => sum + l.basePrice, 0) + (active ? active.basePrice : 0);

  const closed = [...sold.map((r) => r.closedAt - r.openedAt), ...unsold.map((r) => r.closedAt - r.openedAt)];
  const avgLoteMs = closed.length > 0 ? closed.reduce((a, b) => a + b, 0) / closed.length : 10 * MIN;
  const remainingLotes = upcoming.length + (active ? 1 : 0);
  const activeElapsed = active ? now - openedAtRef.current : 0;
  const etaAt = now + Math.max(0, remainingLotes - 1) * avgLoteMs + (active ? Math.max(avgLoteMs - activeElapsed, 60_000) : avgLoteMs);

  // Un desierto que se volvió a rematar deja de contarse como tal (vuelve a la cola).
  const uniqueUnsold = unsold.filter(
    (u) => !upcoming.some((l) => l.number === u.number) && active?.number !== u.number && !sold.some((s) => s.number === u.number),
  );

  const totalLotes = sold.length + uniqueUnsold.length + upcoming.length + (active ? 1 : 0);

  const lotesMap: LoteCell[] = useMemo(() => {
    const cells: LoteCell[] = [];
    sold.forEach((r) => cells.push({ number: r.number, title: r.title, status: 'sold', base: r.base, final: r.final }));
    uniqueUnsold.forEach((r) => cells.push({ number: r.number, title: r.title, status: 'unsold', base: r.base }));
    if (active) cells.push({ number: active.number, title: active.title, status: 'open', base: active.basePrice });
    upcoming.forEach((l: MockLote) => cells.push({ number: l.number, title: l.title, status: 'pending', base: l.basePrice }));
    return cells.sort((a, b) => a.number - b.number);
  }, [sold, uniqueUnsold, active, upcoming]);

  const quiet = secondsSinceLastOffer;
  const alerts: PanelAlert[] = [];
  if (!operatorOnline) {
    alerts.push({
      id: 'no-operator',
      level: 'critical',
      title: 'No hay martillero conectado',
      detail: 'Nadie está operando el remate. Compartile el ID y el código desde "Martillero".',
    });
  }
  if (state === 'paused') {
    alerts.push({
      id: 'paused',
      level: 'warning',
      title: 'El remate está en pausa',
      detail: 'Los compradores no pueden ofertar hasta que el martillero lo reanude.',
    });
  }
  if (state === 'live' && active && quiet !== null && quiet >= 60) {
    alerts.push({
      id: 'quiet',
      level: 'warning',
      title: `El lote ${active.number} lleva ${Math.floor(quiet / 60)} min sin ofertas nuevas`,
      detail: 'Suele ser el momento en que el martillero adjudica o cierra el lote.',
    });
  }
  if (!streamOn) {
    alerts.push({
      id: 'no-stream',
      level: 'info',
      title: 'La sala no tiene transmisión',
      detail: 'Los compradores no ven el video. Cargá el link de YouTube desde "Transmisión".',
    });
  }
  if (desiertos.length > 0) {
    alerts.push({
      id: 'desiertos',
      level: 'info',
      title: `${desiertos.length} ${desiertos.length === 1 ? 'lote desierto espera' : 'lotes desiertos esperan'} una decisión`,
      detail: 'Podés volver a rematarlos al final de la cola.',
    });
  }

  return {
    ...base,
    operatorOnline,
    streamOn,
    sold,
    unsold: uniqueUnsold,
    events,
    buckets,
    totalOfertas,
    ofertasPerMin,
    revenue,
    upliftPct,
    avgTicket,
    queueBase,
    avgLoteMs,
    etaAt,
    remainingLotes,
    totalLotes,
    lotesMap,
    connHistory,
    alerts,
    questions,
    pendingQuestions,
    answerQuestion,
    dismissQuestion,
    openedAt: openedAtRef.current,
    startedAt: now - base.elapsedSeconds * 1000,
  };
}

export type EmpresaSim = ReturnType<typeof useEmpresaSim>;
