import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BadgeCheck,
  Boxes,
  ChevronsRight,
  Gavel,
  Lock,
  MessageSquare,
  PackageCheck,
  PackageX,
  PauseCircle,
  Pencil,
  PlayCircle,
  RotateCcw,
  Trash2,
  UserX,
  VolumeX,
  XOctagon,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { RotatingMockup, type MockupScene } from './RotatingMockup';
import { CoverBox, Eyebrow } from './mockupPrimitives';

const ACTION_TONE_CLASSES: Record<'brand' | 'success' | 'warning' | 'danger' | 'ink', string> = {
  brand: 'border-brand-200 text-brand-700',
  success: 'border-success-200 text-success-700',
  warning: 'border-warning-200 text-warning-700',
  danger: 'border-danger-200 text-danger-700',
  ink: 'border-slate-200 text-slate-600',
};

function ActionChip({
  icon: Icon,
  tone,
  full = false,
  className,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof ACTION_TONE_CLASSES;
  full?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center gap-1.5 rounded-md border bg-white px-2 py-1.5 text-[11px] font-semibold shadow-sm',
        full ? 'w-full' : 'flex-1',
        ACTION_TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

const CONECTADOS = ['Comprador #214', 'Comprador #087', 'Comprador #133'];

const PROXIMOS_LOTES = [
  { number: 15, title: 'Lote de vaquillonas', selected: true },
  { number: 16, title: 'Toro Hereford PC', selected: false },
  { number: 17, title: 'Lote mixto Angus', selected: false },
];

/** Pool de ofertas nuevas que va agregando `OfertaChatScene` -- arranca en el índice 1
 * (la 0 ya está precargada como "Aceptada" al montar), cicla con `%` cuando se acaba. */
const OFERTA_POOL: { amount: string; bidder: string }[] = [
  { amount: '$18.500', bidder: 'Comprador #133' },
  { amount: '$19.000', bidder: 'Comprador #087' },
  { amount: '$19.400', bidder: 'Comprador #214' },
  { amount: '$19.800', bidder: 'Comprador #133' },
  { amount: '$20.200', bidder: 'Comprador #087' },
  { amount: '$20.600', bidder: 'Comprador #214' },
];

/** Pool de mensajes nuevos de `OfertaChatScene` -- mismo criterio que `OFERTA_POOL`. */
const CHAT_POOL: { from: string; text: string; mine?: boolean }[] = [
  { from: 'Comprador #214', text: '¿Tiene guía sanitaria al día?' },
  { from: 'Vos', text: 'Sí, se entrega en el acto.', mine: true },
  { from: 'Comprador #133', text: '¿Se puede retirar mañana?' },
  { from: 'Vos', text: 'Sí, coordinamos por chat.', mine: true },
  { from: 'Comprador #087', text: '¿Hay financiación?' },
];

/**
 * Escena "Oferta líder y chat" (pedido explícito): a diferencia del resto de las
 * escenas de `SCENES` -- contenido estático, solo cruzan por opacidad entre ellas --
 * esta necesita su propio estado, así que vive como componente aparte. Dividida a la
 * mitad (ofertas a la izquierda, chat a la derecha, antes apiladas una debajo de la
 * otra) y con nuevas ofertas/mensajes entrando solos cada tanto (`setInterval` +
 * `AnimatePresence`, entra el más nuevo arriba/abajo según corresponda y sale el más
 * viejo) para que se sienta una sala realmente en vivo, no una captura fija. Respeta
 * `prefers-reduced-motion` (no agrega ninguno de los dos intervalos) -- mismo criterio
 * que la rotación de escenas de `RotatingMockup`.
 */
function OfertaChatScene() {
  const prefersReducedMotion = useReducedMotion();
  const [offers, setOffers] = useState([{ id: 0, ...OFERTA_POOL[0] }]);
  const [messages, setMessages] = useState([
    { id: 0, from: 'Comprador #087', text: '¿Incluye flete el lote 14?' },
    { id: 1, from: 'Vos', text: 'Sí, dentro del radio pactado.', mine: true },
  ]);
  const offerCounter = useRef(1);
  const chatCounter = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      const n = offerCounter.current++;
      setOffers((prev) => [{ id: n, ...OFERTA_POOL[n % OFERTA_POOL.length] }, ...prev].slice(0, 3));
    }, 2800);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      const n = chatCounter.current++;
      setMessages((prev) => [...prev, { id: n + 100, ...CHAT_POOL[n % CHAT_POOL.length] }].slice(-3));
    }, 3600);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  const leader = offers[0];

  return (
    <div className="flex flex-1 gap-3">
      <div className="flex w-1/2 flex-col">
        <Eyebrow>Oferta líder</Eyebrow>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={leader.id}
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-2 flex items-center gap-2 rounded-lg bg-success-50 px-2.5 py-2"
          >
            <BadgeCheck className="h-4 w-4 shrink-0 text-success-600" />
            <div className="min-w-0 text-xs leading-tight">
              <p className="truncate font-semibold text-success-700">{leader.bidder}</p>
              <p className="text-success-600">Lidera con {leader.amount}</p>
            </div>
          </motion.div>
        </AnimatePresence>
        <ul className="mt-1.5 flex-1 space-y-1 overflow-hidden">
          <AnimatePresence initial={false}>
            {offers.slice(1).map((offer) => (
              <motion.li
                key={offer.id}
                layout
                initial={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-between border-b border-slate-100 py-1 text-xs"
              >
                <span className="font-mono tabular-nums text-slate-700">{offer.amount}</span>
                <Badge variant="neutral">Superada</Badge>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="w-px shrink-0 bg-slate-200" />

      <div className="flex w-1/2 flex-col">
        <Eyebrow icon={MessageSquare}>Chat</Eyebrow>
        <ul className="mt-1.5 flex-1 space-y-1.5 overflow-hidden text-xs">
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
                  <p className="text-sky-700">{message.text}</p>
                ) : (
                  <p className="text-slate-600">
                    <span className="font-semibold text-slate-500">{message.from}: </span>
                    {message.text}
                  </p>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div className="mt-auto flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200">
          <span className="flex-1 truncate text-[11px] text-slate-400">Escribí un mensaje...</span>
        </div>
      </div>
    </div>
  );
}

const SCENES: MockupScene[] = [
  {
    key: 'panel-control',
    label: 'Panel de control operativo',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Panel de control operativo</Eyebrow>
        <div className="mt-2 flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gestión de lote</p>
            <div className="mt-1 flex flex-col gap-1.5">
              <ActionChip icon={ChevronsRight} tone="brand" full>
                Pasar al siguiente lote
              </ActionChip>
              <div className="flex gap-1.5">
                <ActionChip icon={PlayCircle} tone="success">
                  Abrir lote
                </ActionChip>
                <ActionChip icon={PackageCheck} tone="ink">
                  Cerrar lote
                </ActionChip>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Adjudicación de lote</p>
            <ActionChip icon={Gavel} tone="success" full className="mt-1">
              Adjudicar lote
            </ActionChip>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controles de remate</p>
            <div className="mt-1 flex gap-1.5">
              <ActionChip icon={PauseCircle} tone="warning">
                Pausar remate
              </ActionChip>
              <ActionChip icon={PlayCircle} tone="ink">
                Reanudar remate
              </ActionChip>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-danger-600">Zona crítica</p>
          <ActionChip icon={XOctagon} tone="danger" full className="mt-1">
            Finalizar remate
          </ActionChip>
        </div>
      </>
    ),
  },
  {
    key: 'lote-activo',
    label: 'Lote activo',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        {/* Imagen principal única (pedido explícito) -- antes 3 miniaturas iguales,
         * después una sola pero demasiado grande (ocupaba casi todo el mockup, sin
         * lugar para título/descripción/precio). Altura fija en vez de por aspecto:
         * grande en relación al resto -- el bloque más alto de la escena -- pero
         * deja lugar real para el resto, igual que en la consola real. */}
        <CoverBox className="h-32 w-full shrink-0" icon={<Boxes className="h-8 w-8 text-brand-300" />} />
        <div className="mt-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-brand-600">
              Lote 14 · Hacienda y ganadería
            </p>
            <h4 className="text-sm font-bold text-slate-900">Toro Angus Colorado PC</h4>
          </div>
          <Badge variant="warning" className="shrink-0">
            Abierto
          </Badge>
        </div>
        <p className="mt-1.5 font-mono text-xs tabular-nums text-slate-500">
          Precio inicial $15.000 · incremento mínimo $500
        </p>
        <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-600">
          Toro reproductor de pedigrí, excelente conformación y genética probada. Apto
          para servicio inmediato.
        </p>
      </>
    ),
  },
  {
    key: 'oferta-chat',
    label: 'Oferta líder y chat',
    urlLabel: 'app.rematar.com/remates/consola',
    content: <OfertaChatScene />,
  },
  {
    key: 'moderacion',
    label: 'Moderación',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Compradores conectados · {CONECTADOS.length}</Eyebrow>
        <ul className="mt-2 space-y-1.5">
          {CONECTADOS.map((name) => (
            <li key={name} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-100">
              <span className="text-xs font-medium text-slate-700">{name}</span>
              <div className="flex items-center gap-1 text-slate-400">
                <VolumeX className="h-3.5 w-3.5" />
                <UserX className="h-3.5 w-3.5" />
              </div>
            </li>
          ))}
        </ul>

        {/* Moderación del chat (pedido explícito, además de silenciar/expulsar
         * compradores de arriba): eliminar un mensaje puntual y bloquear el chat de
         * toda la sala -- las otras dos acciones principales de moderación. */}
        <Eyebrow icon={MessageSquare} className="mt-3">
          Chat de la sala
        </Eyebrow>
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-100">
          <p className="min-w-0 truncate text-xs text-slate-600">
            <span className="font-semibold text-slate-500">Comprador #133: </span>
            ¡Descuentos en mi-pagina.com!
          </p>
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-danger-500" />
        </div>

        <ActionChip icon={Lock} tone="ink" full className="mt-2">
          Bloquear chat
        </ActionChip>
      </>
    ),
  },
  {
    key: 'proximos-lotes',
    label: 'Próximos lotes',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Próximos lotes</Eyebrow>
        <div className="mt-2.5 flex flex-1 gap-2">
          {PROXIMOS_LOTES.map((lote) => (
            <div
              key={lote.number}
              className={clsx(
                'flex w-1/3 flex-col gap-1.5 rounded-lg p-1',
                lote.selected && 'ring-2 ring-brand-500',
              )}
            >
              <CoverBox className="aspect-square w-full" icon={<Boxes className="h-6 w-6 text-brand-300" />} />
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Lote {lote.number}</p>
              <Badge variant="neutral" className="w-fit">
                Pendiente
              </Badge>
              <p className="truncate text-xs text-slate-600">{lote.title}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    key: 'lote-desierto',
    label: 'Volver a rematar un lote desierto',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow icon={PackageX}>Lotes desiertos</Eyebrow>
        <div className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-100">
          <CoverBox className="h-12 w-16 shrink-0" icon={<Boxes className="h-5 w-5 text-brand-300" />} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Lote 9</span>
              <Badge variant="neutral">Desierto</Badge>
            </div>
            <p className="truncate text-xs font-semibold text-slate-700">Vaquillona Brangus PC</p>
          </div>
        </div>

        <Eyebrow className="mt-3">Nueva ronda</Eyebrow>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {[
            { label: 'Precio inicial', value: '$12.000' },
            { label: 'Incremento mínimo', value: '$400' },
          ].map((field) => (
            <div
              key={field.label}
              className="flex items-center justify-between gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-[9px] font-medium uppercase tracking-wide text-slate-400">
                  {field.label}
                </p>
                <p className="truncate font-mono text-xs font-bold text-slate-900">{field.value}</p>
              </div>
              <Pencil className="h-3 w-3 shrink-0 text-slate-300" />
            </div>
          ))}
        </div>

        <ActionChip icon={RotateCcw} tone="brand" full className="mt-auto">
          Volver a rematar
        </ActionChip>
      </>
    ),
  },
];

/**
 * Visual de la sección "Beneficios para rematadores" (`BenefitsSection` en
 * `LandingPage`) -- recreación con `RotatingMockup` de la consola operativa real que usa
 * el rematador (panel de control, lote activo, oferta líder + chat, moderación, próximos
 * lotes y reincorporar un lote desierto), en vez del video único que mostraba antes
 * `RematadorConsoleMockup`.
 */
export function RematadorMockup() {
  return <RotatingMockup scenes={SCENES} />;
}
