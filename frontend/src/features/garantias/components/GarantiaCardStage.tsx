import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import type { SecureFieldName } from '../mercadopagoFields';

/** Lo único que la tarjeta animada refleja del formulario. Nunca el número completo, el
 * vencimiento ni el CVV -- viven en los iframes de Mercado Pago (ver `mercadopagoFields.
 * ts`): del número solo se conoce el BIN, del resto solo si el campo ya quedó válido. */
export interface CardView {
  bin: string | null;
  numberValid: boolean;
  expirationValid: boolean;
  securityCodeValid: boolean;
  holder: string;
  /** `payment_method_id` de MP (`visa`, `master`, ...) o `null` si todavía no se sabe. */
  paymentMethodId: string | null;
  focus: SecureFieldName | 'holder' | null;
}

export const EMPTY_CARD_VIEW: CardView = {
  bin: null,
  numberValid: false,
  expirationValid: false,
  securityCodeValid: false,
  holder: '',
  paymentMethodId: null,
  focus: null,
};

export interface GarantiaCardStageProps {
  /** Estado del diálogo contenedor. Maneja el reinicio de la escena: `AnimatePresence`
   * puede mantener este componente montado mientras hace su propia animación de salida,
   * así que no alcanza con inicializar `phase` una sola vez al montar -- ver el efecto de
   * más abajo que lo reinicia cada vez que esto pasa a `false`. */
  isOpen: boolean;
  view: CardView;
  /** `false`: la billetera aparece con la tarjeta guardada; `true`: la tarjeta sale y se
   * asienta al centro. */
  revealCard: boolean;
  /** `true`: la garantía quedó autorizada -- la tarjeta muestra un tilde y, pasado un
   * instante, arranca la secuencia de salida (la billetera reaparece, la tarjeta se
   * guarda y se van hacia abajo). */
  isSuccess: boolean;
  /** Se llama cuando arranca la parte final de la salida (billetera + tarjeta yéndose):
   * quien renderiza el diálogo lo cierra en ese momento, así las dos salidas coinciden. */
  onExitStart?: () => void;
}

type Phase = 'hidden' | 'tucked' | 'out' | 'settled' | 'lift' | 'stash' | 'leave';

const EASE = [0.22, 1, 0.36, 1] as const;
const EXIT_EASE = [0.4, 0, 0.2, 1] as const;

/** Cuánto se ve el tilde antes de que reaparezca la billetera; después, la tarjeta se
 * levanta apenas mientras la billetera sube (`STASH_AFTER_MS`), se guarda en el bolsillo
 * y recién ahí (`LEAVE_AFTER_MS`) se van juntas hacia abajo. 1500ms (no 1200): le da tiempo
 * de sobra a la animación del panel derecho (`CardFormStep`, agujero negro -> tilde ~1.36s)
 * para terminar del todo antes de que la billetera arranque -- todo tiene que irse junto. */
const SUCCESS_HOLD_MS = 1500;
const STASH_AFTER_MS = 900;
const LEAVE_AFTER_MS = 2000;

// Geometría (px) de la escena de 400x520: la billetera ocupa la parte baja, la tarjeta
// arranca guardada detrás del bolsillo (asoma 12px), sube, y se asienta al centro.
const CARD_OUT_Y = -205;
const CARD_SETTLED_Y = -145;

function buildVariants(instant: boolean): { wallet: Variants; card: Variants } {
  const t = (duration: number) => ({ duration: instant ? 0 : duration, ease: EASE });
  return {
    wallet: {
      hidden: { opacity: 0, y: 30, scale: 0.96, transition: t(0.6) },
      tucked: { opacity: 1, y: 0, scale: 1, transition: t(1) },
      out: { opacity: 1, y: 0, scale: 1, transition: t(0.6) },
      settled: { opacity: 0, y: 170, scale: 0.98, transition: t(0.9) },
      // Salida: la billetera reaparece desde abajo, espera a la tarjeta y se va hacia abajo.
      lift: { opacity: 1, y: 0, scale: 1, transition: t(0.9) },
      stash: { opacity: 1, y: 0, scale: 1, transition: t(0.9) },
      leave: { opacity: 0, y: 260, scale: 1, transition: { duration: instant ? 0 : 0.8, ease: EXIT_EASE } },
    },
    card: {
      hidden: { opacity: 0, y: 0, rotateX: 0, transition: t(0.4) },
      tucked: { opacity: 1, y: 0, rotateX: 0, transition: t(0.4) },
      out: { opacity: 1, y: CARD_OUT_Y, rotateX: 9, transition: t(0.9) },
      settled: { opacity: 1, y: CARD_SETTLED_Y, rotateX: 0, transition: t(0.9) },
      // Salida: se levanta hasta quedar sobre la boca de la billetera, baja y se guarda
      // detrás del bolsillo, y se va con ella. Misma duración que la billetera en `lift`
      // (antes 0.5s contra los 0.9s de la billetera: la tarjeta llegaba y se quedaba
      // quieta ~400ms esperando a `stash` -- un salto perceptible, nada fluido).
      lift: { opacity: 1, y: CARD_OUT_Y, rotateX: 0, transition: t(0.9) },
      stash: { opacity: 1, y: 0, rotateX: 0, transition: t(1) },
      leave: { opacity: 0, y: 260, rotateX: 0, transition: { duration: instant ? 0 : 0.8, ease: EXIT_EASE } },
    },
  };
}

/**
 * Escena animada del costado del formulario de garantía: una billetera de la que sale una
 * tarjeta que se asienta al centro y se va "completando" a medida que el comprador carga
 * los datos. Decorativa (`aria-hidden`): el formulario es la única fuente de verdad.
 */
export function GarantiaCardStage({ isOpen, view, revealCard, isSuccess, onExitStart }: GarantiaCardStageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>('hidden');
  const { wallet, card } = buildVariants(reduceMotion);
  // Ref para no reiniciar la secuencia si el padre cambia de identidad el callback.
  const onExitStartRef = useRef(onExitStart);
  onExitStartRef.current = onExitStart;

  // La billetera aparece un instante después de abrirse el diálogo (que ya tiene su
  // propia entrada), para que las dos animaciones no se pisen. Depende de `isOpen`, no
  // solo del montaje: `AnimatePresence` (en `GarantiaDialog`) puede seguir con este
  // componente montado mientras hace su propia salida, así que si el diálogo se cierra y
  // se reabre antes de que eso termine, este efecto no se dispararía de nuevo y la escena
  // quedaría "trabada" con la tarjeta ya afuera de una apertura anterior. Reiniciar acá a
  // `hidden` en cuanto `isOpen` pasa a `false` es lo que garantiza que la próxima apertura
  // siempre arranque de cero.
  useEffect(() => {
    if (!isOpen) {
      setPhase('hidden');
      return;
    }
    const timer = setTimeout(() => setPhase((p) => (p === 'hidden' ? 'tucked' : p)), reduceMotion ? 0 : 450);
    return () => clearTimeout(timer);
  }, [isOpen, reduceMotion]);

  useEffect(() => {
    if (!isOpen || !revealCard) return;
    setPhase('out');
    // 950ms: la transición de `out` dura 900ms (`t(0.9)` más arriba) -- antes este timeout
    // esperaba 1400ms, dejando a la tarjeta inmóvil ~500ms en el aire antes de continuar
    // hacia `settled`. El margen que queda acá es solo para que React alcance a aplicar el
    // nuevo estado antes de interrumpir la transición en curso.
    const timer = setTimeout(() => setPhase('settled'), reduceMotion ? 0 : 950);
    return () => clearTimeout(timer);
  }, [isOpen, revealCard, reduceMotion]);

  // Secuencia de salida tras una garantía autorizada. Con "reducir movimiento" se salta la
  // coreografía y solo se espera lo justo para leer el resultado.
  useEffect(() => {
    if (!isOpen || !isSuccess) return;
    const timers = reduceMotion
      ? [setTimeout(() => onExitStartRef.current?.(), SUCCESS_HOLD_MS)]
      : [
          setTimeout(() => setPhase('lift'), SUCCESS_HOLD_MS),
          setTimeout(() => setPhase('stash'), SUCCESS_HOLD_MS + STASH_AFTER_MS),
          setTimeout(() => {
            setPhase('leave');
            onExitStartRef.current?.();
          }, SUCCESS_HOLD_MS + LEAVE_AFTER_MS),
        ];
    return () => timers.forEach(clearTimeout);
  }, [isOpen, isSuccess, reduceMotion]);

  const digits = Array.from({ length: 16 }, (_, i) => {
    const typed = view.bin?.[i];
    return { char: typed ?? '•', on: Boolean(typed) || view.numberValid };
  });
  const groups = [0, 1, 2, 3].map((g) => digits.slice(g * 4, g * 4 + 4));
  const isVisa = view.paymentMethodId === 'visa';
  const isMastercard = view.paymentMethodId === 'master';
  const flipped = view.focus === 'securityCode' && !isSuccess;

  return (
    <div
      aria-hidden="true"
      className="relative flex h-full min-h-[560px] items-center justify-center overflow-hidden bg-slate-100"
    >
      <div className="relative h-[520px] w-[400px] scale-[.85] lg:scale-100" style={{ perspective: 1400 }}>
        <motion.div
          variants={wallet}
          initial="hidden"
          animate={phase}
          className="absolute left-0 top-[270px] z-[1] h-[250px] w-[400px] rounded-[22px] border border-[#262d3b] bg-[#141821] shadow-[0_40px_60px_-28px_rgba(11,15,26,.5)]"
        />

        <motion.div
          variants={card}
          initial="hidden"
          animate={phase}
          style={{ transformStyle: 'preserve-3d' }}
          className="absolute left-[30px] top-[298px] z-[2] h-[214px] w-[340px]"
        >
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.8, ease: [0.3, 0.9, 0.3, 1] }}
            style={{ transformStyle: 'preserve-3d' }}
            className="relative h-full w-full rounded-[18px] shadow-[0_30px_50px_-20px_rgba(11,15,26,.55)]"
          >
            <CardFront
              view={view}
              groups={groups}
              isVisa={isVisa}
              isMastercard={isMastercard}
              shine={phase === 'settled'}
              reduceMotion={reduceMotion}
            />
            <CardBack view={view} />
          </motion.div>

          {isSuccess && (
            <motion.span
              initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-success-500 text-white shadow-lg ring-4 ring-slate-100"
            >
              <Check className="h-5 w-5" strokeWidth={3} />
            </motion.span>
          )}
        </motion.div>

        <motion.div
          variants={wallet}
          initial="hidden"
          animate={phase}
          className="absolute left-0 top-[310px] z-[3] h-[210px] w-[400px] rounded-b-[22px] rounded-t-lg border border-[#2a3142] bg-[#1a1f2b]"
        >
          <span className="absolute left-1/2 top-0 block h-[3px] w-11 -translate-x-1/2 bg-[#8fa8ff]/85" />
          <span className="absolute inset-2.5 rounded-2xl border border-white/5" />
        </motion.div>
      </div>
    </div>
  );
}

const FACE_BASE =
  'absolute inset-0 overflow-hidden rounded-[18px] border border-white/[.13] bg-gradient-to-br from-[#2c3446] via-[#161a24] to-[#202737] text-[#e8ecf4]';
const HIDE_BACK: CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };

function highlight(active: boolean) {
  return clsx('rounded px-1 -mx-1 transition-colors duration-300', active && 'bg-[#8fa8ff]/20');
}

function CardFront({
  view,
  groups,
  isVisa,
  isMastercard,
  shine,
  reduceMotion,
}: {
  view: CardView;
  groups: Array<Array<{ char: string; on: boolean }>>;
  isVisa: boolean;
  isMastercard: boolean;
  shine: boolean;
  reduceMotion: boolean;
}) {
  return (
    <div style={HIDE_BACK} className={clsx(FACE_BASE, 'flex flex-col justify-between p-6')}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={shine && !reduceMotion ? { x: ['-120%', '330%'], opacity: [0, 1, 0] } : { opacity: 0 }}
        transition={{ duration: 1.6, delay: 0.5, times: [0, 0.2, 1], ease: 'easeOut' }}
        className="pointer-events-none absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="flex items-center justify-between">
        <div className="flex h-[30px] w-10 flex-col justify-between rounded-md border border-[#8fa8ff]/50 bg-[#8fa8ff]/15 px-1.5 py-[5px]">
          <i className="block h-px bg-[#8fa8ff]/55" />
          <i className="block h-px bg-[#8fa8ff]/55" />
          <i className="block h-px bg-[#8fa8ff]/55" />
        </div>
        <div className="flex min-h-6 items-center gap-3 text-[#e8ecf4]/70">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8 8.5a5 5 0 0 1 0 7" />
            <path d="M11.5 6a8.5 8.5 0 0 1 0 12" />
            <path d="M15 3.5a12 12 0 0 1 0 17" />
          </svg>
          {isVisa && <span className="text-base font-extrabold italic tracking-wide text-white">VISA</span>}
          {isMastercard && (
            <span className="relative block h-[22px] w-[34px]">
              <i className="absolute left-0 top-0 h-[22px] w-[22px] rounded-full bg-[#e8ecf4]" />
              <i className="absolute right-0 top-0 h-[22px] w-[22px] rounded-full bg-[#8fa8ff] opacity-85" />
            </span>
          )}
        </div>
      </div>

      <div className={clsx(highlight(view.focus === 'cardNumber'), 'self-start whitespace-nowrap py-[3px] font-mono text-xl')}>
        {groups.map((group, g) => (
          <span key={g} className="mr-[.55em]">
            {group.map((d, i) => (
              <span
                key={i}
                className={clsx(
                  'inline-block w-[.68em] text-center transition-colors duration-300',
                  d.on ? 'text-[#f5f7fb]' : 'text-[#e8ecf4]/30',
                )}
              >
                {d.char}
              </span>
            ))}
          </span>
        ))}
      </div>

      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[8px] uppercase tracking-[.16em] opacity-55">Titular</div>
          <div className={clsx(highlight(view.focus === 'holder'), 'truncate font-mono text-xs leading-5 tracking-[.06em]')}>
            {view.holder ? (
              view.holder.toUpperCase()
            ) : (
              <span className="opacity-35">NOMBRE APELLIDO</span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[8px] uppercase tracking-[.16em] opacity-55">Vence</div>
          <div className={clsx(highlight(view.focus === 'expirationDate'), 'font-mono text-xs leading-5 tracking-[.06em]')}>
            <span className={view.expirationValid ? '' : 'opacity-35'}>{view.expirationValid ? '••/••' : 'MM/AA'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardBack({ view }: { view: CardView }) {
  return (
    <div
      style={{ ...HIDE_BACK, transform: 'rotateY(180deg)' }}
      className={clsx(FACE_BASE, 'flex flex-col justify-start gap-[22px] pb-6')}
    >
      <div className="mt-7 h-11 bg-[#05070b]" />
      <div className="mx-6 flex h-[38px] items-center justify-between rounded bg-white/[.08] pl-3 pr-2">
        <span className="text-[9px] uppercase tracking-[.14em] opacity-55">Firma autorizada</span>
        <span
          className={clsx(
            'rounded-[3px] px-2.5 py-1 font-mono text-[15px] tracking-[.14em] text-[#0a0d14] transition-colors duration-300',
            view.focus === 'securityCode' ? 'bg-[#8fa8ff]' : 'bg-[#f5f7fb]',
          )}
        >
          {view.securityCodeValid ? '•••' : <span className="opacity-40">•••</span>}
        </span>
      </div>
      <p className="mx-6 text-[10px] opacity-50">Código de seguridad de 3 dígitos</p>
    </div>
  );
}
