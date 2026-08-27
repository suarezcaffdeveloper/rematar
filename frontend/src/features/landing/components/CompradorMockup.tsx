import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Boxes, Building2, Send, Timer, User } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { RotatingMockup, type MockupScene } from './RotatingMockup';
import { CoverBox, Eyebrow } from './mockupPrimitives';

/** `"$20.400"` a partir de un número -- mismo formato que los montos hardcodeados del
 * resto del mockup (`toLocaleString('es-AR')` separa miles con punto), pero como función
 * porque acá los montos cambian solos (oferta actual, ofertas recientes). */
function formatOffer(amount: number): string {
  return `$${amount.toLocaleString('es-AR')}`;
}

const LOTES_DEL_REMATE: { number: number; title: string; label: string; variant: 'warning' | 'neutral' | 'success' }[] = [
  { number: 14, title: 'Toro Angus Colorado', label: 'Abierto', variant: 'warning' },
  { number: 15, title: 'Lote de vaquillonas', label: 'Pendiente', variant: 'neutral' },
  { number: 13, title: 'Toro Hereford PC', label: 'Vendido', variant: 'success' },
];

/** Pool de mensajes que va agregando `ChatScene` -- `mine: true` se "escribe" en el
 * input letra por letra antes de aparecer en el chat (pedido explícito: que se vea
 * como si alguien estuviera realmente escribiendo, no solo apareciendo); los del resto
 * de la sala aparecen directo después de una pausa corta, simulando que llegaron solos. */
const CHAT_SCRIPT: { from: string; text: string; mine?: boolean }[] = [
  { from: 'Comprador #087', text: '¿Se puede coordinar el retiro para el finde?' },
  { from: 'Vos', text: 'Dale, después del remate te paso los datos.', mine: true },
  { from: 'Comprador #214', text: '¿Incluye flete el lote 14?' },
  { from: 'Vos', text: 'Sí, dentro del radio pactado.', mine: true },
  { from: 'Comprador #087', text: 'Genial, gracias por la info.' },
];

/**
 * Escena "Chat del remate" (pedido explícito: que se vea, tipo video, que alguien
 * escribe un mensaje y lo envía y aparece en el chat) -- a diferencia del resto de
 * `SCENES`, contenido estático que solo cruza por opacidad, esta necesita su propio
 * estado. El mensaje del martillero queda fijo arriba como encabezado de la sala; los
 * mensajes de `CHAT_SCRIPT` se van escribiendo/agregando solos con `setTimeout`
 * encadenado, en loop. Respeta `prefers-reduced-motion`: sin el loop, se ve el chat ya
 * con los dos primeros mensajes cargados (mismo criterio que `OfertaChatScene` en
 * `RematadorMockup`).
 */
function ChatScene() {
  const prefersReducedMotion = useReducedMotion();
  const [messages, setMessages] = useState(() =>
    CHAT_SCRIPT.slice(0, 2).map((line, i) => ({ id: i, ...line })),
  );
  const [draft, setDraft] = useState('');
  const scriptIndex = useRef(2);
  const idCounter = useRef(2);

  useEffect(() => {
    if (prefersReducedMotion) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
      timers.push(id);
    };

    const playNext = () => {
      const line = CHAT_SCRIPT[scriptIndex.current % CHAT_SCRIPT.length];
      scriptIndex.current += 1;

      if (line.mine) {
        let i = 0;
        const typeChar = () => {
          i += 1;
          setDraft(line.text.slice(0, i));
          if (i < line.text.length) {
            wait(typeChar, 45);
          } else {
            wait(() => {
              setDraft('');
              setMessages((prev) => [...prev, { id: idCounter.current++, ...line }].slice(-4));
              wait(playNext, 1800);
            }, 500);
          }
        };
        wait(typeChar, 500);
      } else {
        wait(() => {
          setMessages((prev) => [...prev, { id: idCounter.current++, ...line }].slice(-4));
          wait(playNext, 1800);
        }, 1000);
      }
    };

    wait(playNext, 1200);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [prefersReducedMotion]);

  return (
    <>
      <Eyebrow>Chat del remate</Eyebrow>
      <div className="mt-2.5 flex-1 space-y-2 overflow-hidden text-sm">
        <div>
          <span className="text-xs font-semibold text-sky-700">Martillero</span>
          <p className="leading-snug text-slate-600">El lote 14 incluye flete dentro del radio pactado.</p>
        </div>
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.li
                key={message.id}
                layout
                initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {message.mine ? (
                  <p className="leading-snug text-brand-700">{message.text}</p>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-slate-500">{message.from}</span>
                    <p className="leading-snug text-slate-600">{message.text}</p>
                  </>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
        <span className="flex-1 truncate text-xs text-slate-600">
          {draft || <span className="text-slate-400">Escribí un mensaje...</span>}
        </span>
        {draft && <span className="h-3 w-0.5 shrink-0 animate-pulse bg-brand-500" />}
        <Send className={clsx('h-3.5 w-3.5 shrink-0', draft ? 'text-brand-600' : 'text-slate-300')} />
      </div>
    </>
  );
}

/**
 * Escena "Panel para ofertar" (rediseño explícito): el input de la oferta ahora va
 * arriba de los 3 botones de precio recomendado -- ya centrados -- en vez de mostrar
 * solo los botones sin forma de ver qué se está por ofertar. Simula el flujo completo:
 * escribe un monto mayor a la oferta actual letra por letra, "clickea" Ofertar (el botón
 * se hunde un instante) y la oferta grande de arriba salta al nuevo valor. Los tres
 * montos recomendados se recalculan siempre en base a la oferta vigente (+500/+1000/
 * +1500, el incremento mínimo de la sala).
 */
function OfertarScene() {
  const prefersReducedMotion = useReducedMotion();
  const [offer, setOffer] = useState(19400);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const offerRef = useRef(offer);
  const cycleRef = useRef(0);
  offerRef.current = offer;

  const quickBids = [500, 1000, 1500].map((increment) => offer + increment);

  useEffect(() => {
    if (prefersReducedMotion) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
      timers.push(id);
    };

    const step = () => {
      const nextOffer = offerRef.current + 1000;
      const target = formatOffer(nextOffer);
      let i = 0;
      const typeChar = () => {
        i += 1;
        setDraft(target.slice(0, i));
        if (i < target.length) {
          wait(typeChar, 80);
        } else {
          wait(() => {
            setSubmitting(true);
            wait(() => {
              setSubmitting(false);
              setDraft('');
              cycleRef.current = (cycleRef.current + 1) % 4;
              setOffer(cycleRef.current === 0 ? 19400 : nextOffer);
              wait(step, 2200);
            }, 260);
          }, 550);
        }
      };
      wait(typeChar, 80);
    };

    wait(step, 1400);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [prefersReducedMotion]);

  return (
    <>
      <Eyebrow>Oferta actual · Comprador verificado</Eyebrow>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={offer}
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900"
        >
          {formatOffer(offer)}
        </motion.p>
      </AnimatePresence>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
        Base $15.000 · incremento mínimo $500
      </p>
      <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700">
        <Timer className="h-3.5 w-3.5" /> Tiempo restante 00:24
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <p className="text-xs font-medium text-slate-500">Tu oferta</p>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
          <span className="flex-1 truncate font-mono text-sm font-semibold tabular-nums text-slate-700">
            {draft || <span className="font-sans font-normal text-slate-400">Ingresá un monto</span>}
          </span>
          {draft && <span className="h-3.5 w-0.5 shrink-0 animate-pulse bg-brand-500" />}
        </div>
        <div className="flex justify-center gap-1.5">
          {quickBids.map((bid) => (
            <span
              key={bid}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              {formatOffer(bid)}
            </span>
          ))}
        </div>
        <div
          className={clsx(
            'rounded-lg px-4 py-2 text-center text-sm font-semibold text-white shadow-sm transition-transform duration-150',
            submitting ? 'scale-95 bg-brand-700' : 'scale-100 bg-brand-600',
          )}
        >
          Ofertar
        </div>
      </div>
    </>
  );
}

/** Pool de montos que va agregando `OfertasRecientesScene` -- mismo criterio que
 * `CHAT_SCRIPT`: cicla con `%` cuando se acaba. */
const OFERTAS_POOL = [19900, 20400, 20900, 21400];

/**
 * Escena "Ofertas recientes" (pedido explícito: mantener el diseño actual, solo agregar
 * la animación de que llega una oferta nueva) -- cada tanto entra un monto nuevo arriba
 * de la lista (con `AnimatePresence`, mismo patrón que la columna de ofertas de
 * `OfertaChatScene` en `RematadorMockup`), la oferta anterior pasa a "Superada" y el
 * cartel de líder de arriba se actualiza con ella.
 */
function OfertasRecientesScene() {
  const prefersReducedMotion = useReducedMotion();
  const [offers, setOffers] = useState<
    { id: number; amount: string; time: string; label: string; variant: 'success' | 'neutral' }[]
  >([
    { id: 0, amount: '$19.400', time: 'hace 12s', label: 'Ganadora', variant: 'success' },
    { id: -1, amount: '$19.000', time: 'hace 38s', label: 'Superada', variant: 'neutral' },
    { id: -2, amount: '$18.500', time: 'hace 1m', label: 'Aceptada', variant: 'neutral' },
  ]);
  const counter = useRef(1);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      const n = counter.current++;
      const amount = formatOffer(OFERTAS_POOL[n % OFERTAS_POOL.length]);
      setOffers((prev) => {
        const superadas = prev.map((offer) => ({
          ...offer,
          label: offer.label === 'Ganadora' ? 'Superada' : offer.label,
          variant: 'neutral' as const,
        }));
        return [{ id: n, amount, time: 'recién', label: 'Ganadora', variant: 'success' }, ...superadas].slice(0, 3);
      });
    }, 2600);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  const leader = offers[0];

  return (
    <>
      <Eyebrow>Ofertas recientes</Eyebrow>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={leader.id}
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-2"
        >
          <BadgeCheck className="h-4 w-4 shrink-0 text-success-600" />
          <div className="text-xs leading-tight">
            <p className="font-semibold text-success-700">Comprador verificado</p>
            <p className="text-success-600">Lidera con {leader.amount}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <ul className="mt-1 flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {offers.map((offer) => (
            <motion.li
              key={offer.id}
              layout
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0"
            >
              <div>
                <p className="font-mono font-semibold tabular-nums text-slate-900">{offer.amount}</p>
                <p className="text-[11px] text-slate-400">{offer.time}</p>
              </div>
              <Badge variant={offer.variant}>{offer.label}</Badge>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

interface RemateCardData {
  title: string;
  category: string;
  description: string;
  date: string;
  label: string;
  variant: 'success' | 'brand' | 'neutral';
}

const REMATES_CARDS: RemateCardData[] = [
  {
    title: 'Remate Estancia La Elena',
    category: 'Hacienda y ganadería',
    description: 'Toros y vaquillonas de pedigrí, genética probada y guía sanitaria al día.',
    date: 'Hoy · 15:00',
    label: 'En vivo',
    variant: 'success',
  },
  {
    title: 'Subasta de maquinaria agrícola',
    category: 'Maquinaria pesada y agrícola',
    description: 'Tractores, sembradoras y cosechadoras revisadas, con service reciente.',
    date: '2 sep · 10:00',
    label: 'Programado',
    variant: 'brand',
  },
  {
    title: 'Remate de inmuebles rurales',
    category: 'Inmuebles',
    description: 'Campos y fracciones con aptitud agrícola-ganadera en distintas provincias.',
    date: '18 ago',
    label: 'Finalizado',
    variant: 'neutral',
  },
  {
    title: 'Feria de reproductores Hereford',
    category: 'Hacienda y ganadería',
    description: 'Toros PC seleccionados por conformación, peso y facilidad de parto.',
    date: '25 ago · 14:00',
    label: 'Programado',
    variant: 'brand',
  },
];

/**
 * Escena "Remates totales" (rediseño explícito: antes una lista vertical simple, ahora
 * cards con los mismos detalles -- título, categoría, fecha, descripción -- estilo
 * "Lotes del remate", en un carrusel que va rotando solo mientras se ve esta escena, como
 * si el comprador estuviera repasando varios remates). Cruza de a una card por vez con
 * `AnimatePresence` (deslizando en vez de solo opacidad, para que se note el pasaje de
 * "carrusel"); los puntos de abajo son solo decorativos (la navegación real de escenas ya
 * la dan los puntos de `RotatingMockup`).
 */
function RematesCarouselScene() {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % REMATES_CARDS.length), 2200);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  const remate = REMATES_CARDS[index];

  return (
    <>
      <Eyebrow>Remates totales</Eyebrow>
      <div className="relative mt-2.5 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={prefersReducedMotion ? undefined : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100"
          >
            <CoverBox className="h-24 w-full shrink-0" icon={<Boxes className="h-7 w-7 text-brand-300" />} />
            <div className="flex flex-1 flex-col p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={remate.variant}>{remate.label}</Badge>
                <span className="shrink-0 text-[10px] text-slate-400">{remate.date}</span>
              </div>
              <h4 className="mt-1.5 truncate text-sm font-bold text-slate-900">{remate.title}</h4>
              <p className="truncate text-[10px] font-bold uppercase tracking-wide text-brand-600">
                {remate.category}
              </p>
              <p className="mt-1 line-clamp-2 flex-1 text-xs leading-snug text-slate-500">{remate.description}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
        {REMATES_CARDS.map((r, i) => (
          <span
            key={r.title}
            className={clsx('h-1 rounded-full transition-all duration-300', i === index ? 'w-4 bg-brand-400' : 'w-1 bg-slate-200')}
          />
        ))}
      </div>
    </>
  );
}

const MIS_COMPRAS: {
  title: string;
  price: string;
  empresa: string;
  martillero: string;
  status: { label: string; variant: 'warning' | 'success' | 'brand' | 'neutral' };
}[] = [
  {
    title: 'Toro Angus Colorado',
    price: '$19.400',
    empresa: 'Estancia La Elena S.A.',
    martillero: 'Juan Carlos Pérez',
    status: { label: 'Pago pendiente', variant: 'warning' },
  },
  {
    title: 'Lote de vaquillonas',
    price: '$15.800',
    empresa: 'Agropecuaria del Sur',
    martillero: 'María Gómez',
    status: { label: 'Pendiente de contacto', variant: 'warning' },
  },
];

const SCENES: MockupScene[] = [
  {
    key: 'chat',
    label: 'Chat del remate',
    urlLabel: 'app.rematar.com/remates/sala',
    content: <ChatScene />,
  },
  {
    key: 'ofertar',
    label: 'Panel para ofertar',
    urlLabel: 'app.rematar.com/remates/sala',
    content: <OfertarScene />,
  },
  {
    key: 'ofertas-recientes',
    label: 'Ofertas recientes',
    urlLabel: 'app.rematar.com/remates/sala',
    content: <OfertasRecientesScene />,
  },
  {
    key: 'lotes-del-remate',
    label: 'Lotes del remate',
    urlLabel: 'app.rematar.com/remates/estancia-la-elena',
    content: (
      <>
        <Eyebrow>Lotes del remate</Eyebrow>
        <div className="mt-2.5 flex flex-1 gap-2">
          {LOTES_DEL_REMATE.map((lote) => (
            <div key={lote.number} className="flex w-1/3 flex-col gap-1.5">
              <CoverBox className="aspect-square w-full" icon={<Boxes className="h-6 w-6 text-brand-300" />} />
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Lote {lote.number}</p>
              <Badge variant={lote.variant} className="w-fit">
                {lote.label}
              </Badge>
              <p className="truncate text-xs text-slate-600">{lote.title}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    key: 'remates-totales',
    label: 'Remates totales',
    urlLabel: 'app.rematar.com/remates',
    content: <RematesCarouselScene />,
  },
  {
    key: 'mis-compras',
    label: 'Mis compras adjudicadas',
    urlLabel: 'app.rematar.com/mis-compras',
    content: (
      <>
        <Eyebrow>Mis compras adjudicadas</Eyebrow>
        <ul className="mt-2.5 flex-1 space-y-2.5">
          {MIS_COMPRAS.map((compra) => (
            <li key={compra.title} className="flex gap-3 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
              <CoverBox className="h-14 w-16 shrink-0" icon={<Boxes className="h-5 w-5 text-brand-300" />} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">{compra.title}</p>
                  <Badge variant={compra.status.variant} className="shrink-0">
                    {compra.status.label}
                  </Badge>
                </div>
                <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-brand-600">{compra.price}</p>
                <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 truncate">
                    <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                    {compra.empresa}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <User className="h-3 w-3 shrink-0 text-slate-400" />
                    {compra.martillero}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>
    ),
  },
];

/**
 * Visual de la sección "Beneficios para compradores" (`BenefitsSection` en
 * `LandingPage`) -- recreación con `RotatingMockup` de las pantallas que un comprador
 * realmente usa (chat, panel para ofertar, ofertas recientes, lotes del remate, listado
 * de remates y seguimiento post-remate), no una única captura o video (ver
 * `RotatingMockup` para el porqué).
 */
export function CompradorMockup() {
  return <RotatingMockup scenes={SCENES} />;
}
