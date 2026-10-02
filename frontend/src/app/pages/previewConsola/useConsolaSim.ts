import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE_LOTE, DESIERTO_LOTES, SOLD_LOTES, UPCOMING_LOTES, type MockLote } from './mockData';

/**
 * Simulación en vivo de la Consola Operativa para las vistas previas A y B (sin backend):
 * llegan ofertas y mensajes de chat solos, y los botones de la botonera funcionan igual que
 * los reales (adjudicar con aviso de oferta reciente, abrir/cerrar lote, pausar, reanudar,
 * finalizar, volver a rematar un desierto). Las dos propuestas dibujan el mismo estado.
 */

export type RemateState = 'live' | 'paused' | 'finished';

export interface MockOffer {
  id: number;
  amount: number;
  at: number;
}

export interface MockChatMessage {
  id: number;
  author: string;
  text: string;
  at: number;
  fromOperator?: boolean;
  /** Id del mensaje (pregunta) al que responde. */
  replyTo?: number;
}

export interface AdjudicatedInfo {
  number: number;
  title: string;
  price: number;
}

export type PendingConfirm = 'pause' | 'finish' | 'recent-offer' | null;

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error';
  text: string;
}

const START_OFFSET_MS = (1 * 60 * 60 + 12 * 60 + 8) * 1000;
const RECENT_OFFER_WARNING_S = 10;

const BUYERS = ['Comprador 14', 'Comprador 27', 'Comprador 31', 'Comprador 08', 'Comprador 52', 'Comprador 19'];
const CHAT_LINES = [
  ['Comprador 27', '¿Las notebooks vienen con cargador?'],
  ['Comprador 14', 'Buen precio para el estado que tienen'],
  ['Comprador 52', '¿Se pueden retirar mañana?'],
  ['Comprador 31', 'Yo voy por el servidor después'],
  ['Comprador 08', 'No escucho bien el audio'],
  ['Comprador 19', 'Ahora sí, perfecto'],
  ['Comprador 27', '¿Incluye factura A?'],
  ['Comprador 14', 'Voy a subir un poco más'],
] as const;

function seedOffers(now: number, base: number, inc: number): MockOffer[] {
  const ages = [38, 71, 104, 139, 190, 244];
  return ages.map((age, index) => ({
    id: index + 1,
    amount: base + inc * (ages.length - 1 - index) + inc,
    at: now - age * 1000,
  }));
}

function seedChat(now: number): MockChatMessage[] {
  return [
    { id: 1, author: 'Comprador 31', text: 'Buenas tardes a todos', at: now - 540_000 },
    { id: 2, author: 'Comprador 14', text: '¿Los equipos tienen garantía?', at: now - 420_000 },
    { id: 3, author: 'Empresa', text: 'Tienen 30 días de garantía de funcionamiento', at: now - 400_000, fromOperator: true, replyTo: 2 },
    { id: 4, author: 'Comprador 27', text: 'Gracias', at: now - 360_000 },
    { id: 5, author: 'Comprador 52', text: 'Estoy atento al lote 6', at: now - 160_000 },
    { id: 6, author: 'Comprador 08', text: '¿Se puede retirar con flete propio o hay que coordinar?', at: now - 95_000 },
    { id: 7, author: 'Comprador 19', text: '¿Las laptops tienen Windows instalado?', at: now - 41_000 },
  ];
}

export function useConsolaSim() {
  const [startedAt] = useState(() => Date.now() - START_OFFSET_MS);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<RemateState>('live');
  const [active, setActive] = useState<MockLote | null>(ACTIVE_LOTE);
  const [upcoming, setUpcoming] = useState<MockLote[]>(UPCOMING_LOTES);
  const [desiertos, setDesiertos] = useState<MockLote[]>(DESIERTO_LOTES);
  const [soldCount, setSoldCount] = useState(SOLD_LOTES.length);
  const [offers, setOffers] = useState<MockOffer[]>(() =>
    seedOffers(Date.now(), ACTIVE_LOTE.basePrice, ACTIVE_LOTE.minIncrement),
  );
  const [chat, setChat] = useState<MockChatMessage[]>(() => seedChat(Date.now()));
  const [connected, setConnected] = useState(47);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [adjudicated, setAdjudicated] = useState<AdjudicatedInfo | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idRef = useRef(100);

  const stateRef = useRef(state);
  const activeRef = useRef(active);
  stateRef.current = state;
  activeRef.current = active;

  const toast = useCallback((tone: ToastMessage['tone'], text: string) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, tone, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  // Reloj: refresca "hace X s" y el tiempo transcurrido.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Ofertas entrantes mientras el remate está en vivo y hay un lote abierto.
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const lote = activeRef.current;
        if (stateRef.current === 'live' && lote) {
          setOffers((list) => {
            const last = list[0]?.amount ?? lote.basePrice - lote.minIncrement;
            return [{ id: ++idRef.current, amount: last + lote.minIncrement, at: Date.now() }, ...list].slice(0, 40);
          });
        }
        schedule();
      }, 4500 + Math.random() * 5500);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  // Mensajes de chat y conectados.
  useEffect(() => {
    let timer = 0;
    let line = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (stateRef.current !== 'finished') {
          const [author, text] = CHAT_LINES[line % CHAT_LINES.length];
          line += 1;
          setChat((list) => [...list, { id: ++idRef.current, author, text, at: Date.now() }].slice(-60));
          setConnected((n) => Math.max(38, Math.min(58, n + (Math.random() > 0.5 ? 1 : -1))));
        }
        schedule();
      }, 6500 + Math.random() * 6000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const winning = active ? (offers[0] ?? null) : null;
  const secondsSinceLastOffer = winning ? Math.max(0, Math.floor((now - winning.at) / 1000)) : null;
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);

  const isLive = state === 'live';
  const isPaused = state === 'paused';
  const canOpenLote = isLive && !active;

  const openLote = useCallback(
    (lote: MockLote) => {
      setActive(lote);
      setUpcoming((list) => list.filter((l) => l.id !== lote.id));
      setOffers([]);
      setSelectedId(null);
      toast('success', 'Lote abierto.');
    },
    [toast],
  );

  const openNext = useCallback(() => {
    if (!canOpenLote || upcoming.length === 0) return;
    openLote(upcoming[0]);
  }, [canOpenLote, upcoming, openLote]);

  const openSelected = useCallback(() => {
    if (!canOpenLote || !selectedId) return;
    const lote = upcoming.find((l) => l.id === selectedId);
    if (lote) openLote(lote);
  }, [canOpenLote, selectedId, upcoming, openLote]);

  const closeAsDesierto = useCallback(() => {
    if (!active || winning || !(isLive || isPaused)) return;
    setDesiertos((list) => [...list, { ...active, status: 'closed_unsold', requeuePreset: null }]);
    setActive(null);
    setOffers([]);
    toast('success', 'Lote cerrado como desierto (sin ofertas).');
  }, [active, winning, isLive, isPaused, toast]);

  const runAdjudicate = useCallback(() => {
    if (!active || !winning) return;
    setAdjudicated({ number: active.number, title: active.title, price: winning.amount });
    setSoldCount((n) => n + 1);
    setActive(null);
    setOffers([]);
    toast('success', 'Lote adjudicado.');
  }, [active, winning, toast]);

  const adjudicate = useCallback(() => {
    if (!active || !winning || !(isLive || isPaused)) return;
    if (secondsSinceLastOffer !== null && secondsSinceLastOffer < RECENT_OFFER_WARNING_S) {
      setPendingConfirm('recent-offer');
      return;
    }
    runAdjudicate();
  }, [active, winning, isLive, isPaused, secondsSinceLastOffer, runAdjudicate]);

  const requeue = useCallback(
    (lote: MockLote) => {
      setDesiertos((list) => list.filter((l) => l.id !== lote.id));
      setUpcoming((list) => [...list, { ...lote, status: 'pending', basePrice: lote.requeuePreset ?? lote.basePrice }]);
      toast('success', `Lote ${lote.number} reincorporado al final de la cola.`);
    },
    [toast],
  );

  const confirm = useCallback(() => {
    if (pendingConfirm === 'pause') {
      setState('paused');
      toast('success', 'El remate se pausó.');
    } else if (pendingConfirm === 'finish') {
      setState('finished');
      toast('success', 'El remate se finalizó.');
    } else if (pendingConfirm === 'recent-offer') {
      runAdjudicate();
    }
    setPendingConfirm(null);
  }, [pendingConfirm, runAdjudicate, toast]);

  const resume = useCallback(() => {
    if (!isPaused) return;
    setState('live');
    toast('success', 'El remate se reanudó.');
  }, [isPaused, toast]);

  const sendChat = useCallback((text: string, options: { author?: string; replyTo?: number } = {}) => {
    const clean = text.trim();
    if (!clean) return;
    setChat((list) => [
      ...list,
      { id: ++idRef.current, author: options.author ?? 'Martillero', text: clean, at: Date.now(), fromOperator: true, replyTo: options.replyTo },
    ]);
  }, []);

  const reset = useCallback(() => {
    const t = Date.now();
    setState('live');
    setActive(ACTIVE_LOTE);
    setUpcoming(UPCOMING_LOTES);
    setDesiertos(DESIERTO_LOTES);
    setSoldCount(SOLD_LOTES.length);
    setOffers(seedOffers(t, ACTIVE_LOTE.basePrice, ACTIVE_LOTE.minIncrement));
    setChat(seedChat(t));
    setSelectedId(null);
    setPendingConfirm(null);
    setAdjudicated(null);
  }, []);

  // Estado de cada oferta: la primera es la líder, el resto fue superada.
  const offerRows = useMemo(
    () => offers.map((offer, index) => ({ ...offer, leading: index === 0 && active !== null })),
    [offers, active],
  );

  return {
    state,
    isLive,
    isPaused,
    active,
    upcoming,
    desiertos,
    soldCount,
    offers: offerRows,
    winning,
    secondsSinceLastOffer,
    elapsedSeconds,
    chat,
    connected,
    buyers: BUYERS,
    selectedId,
    setSelectedId,
    pendingConfirm,
    setPendingConfirm,
    adjudicated,
    dismissAdjudicated: () => setAdjudicated(null),
    toasts,
    canOpenLote,
    openNext,
    openSelected,
    closeAsDesierto,
    adjudicate,
    confirm,
    resume,
    requeue,
    sendChat,
    reset,
    now,
  };
}

export type ConsolaSim = ReturnType<typeof useConsolaSim>;
