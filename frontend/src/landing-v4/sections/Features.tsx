import { motion, useReducedMotion } from 'framer-motion';
import { FEATURES } from '../../features/landing/data';
import { EASE_CINE, EASE_OUT, formatUsd, Reveal, Shell, Spot, SplitHeading } from '../lib';

const START = 31_800;
const STEP = 250;
/** Ofertas de ejemplo: posición en el tiempo (0–100) y comprador. */
const BIDS = [
  { t: 5, who: '#214' },
  { t: 13, who: '#087' },
  { t: 19, who: '#214' },
  { t: 31, who: 'Vos' },
  { t: 38, who: '#133' },
  { t: 53, who: '#087' },
  { t: 61, who: 'Vos' },
  { t: 68, who: '#214' },
  { t: 81, who: '#052' },
  { t: 89, who: '#087' },
];

const W = 640;
const H = 280;
const PAD = { l: 64, r: 28, t: 56, b: 34 };
const MAX_PRICE = START + STEP * (BIDS.length + 1);

const xOf = (t: number) => PAD.l + (t / 100) * (W - PAD.l - PAD.r);
const yOf = (price: number) => H - PAD.b - ((price - START) / (MAX_PRICE - START)) * (H - PAD.t - PAD.b);

/** Camino escalonado: el precio solo sube, y lo hace de golpe en cada oferta. */
function stepPath(): string {
  let d = `M ${xOf(0)} ${yOf(START)}`;
  BIDS.forEach((bid, index) => {
    d += ` H ${xOf(bid.t)} V ${yOf(START + STEP * (index + 1))}`;
  });
  return `${d} H ${xOf(97)}`;
}

/**
 * Gráfico de la puja de un lote, dibujado a medida que se entra en pantalla: el precio sube en
 * escalones, cada oferta marca un punto con su comprador y el cierre queda señalado.
 */
function BidChart() {
  const reduce = useReducedMotion();
  const path = stepPath();
  const final = START + STEP * BIDS.length;
  const drawS = reduce ? 0 : 3.4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Gráfico de una puja: el precio sube de ${formatUsd(START)} a ${formatUsd(final)} en ${BIDS.length} ofertas.`}>
      {[0, 1, 2, 3].map((line) => {
        const price = START + ((MAX_PRICE - START) / 3) * line;
        return (
          <g key={line}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(price)} y2={yOf(price)} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 5" />
            <text x={PAD.l - 12} y={yOf(price) + 4} textAnchor="end" fontSize="11" fill="rgba(255,255,255,0.4)">
              {Math.round(price).toLocaleString('es-AR')}
            </text>
          </g>
        );
      })}

      <motion.path
        d={`${path} V ${H - PAD.b} H ${xOf(0)} Z`}
        fill="url(#lv4-area)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.6, delay: drawS * 0.55 }}
      />
      <defs>
        <linearGradient id="lv4-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2451f2" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#2451f2" stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.path
        d={path}
        fill="none"
        stroke="#9db3fa"
        strokeWidth="1.75"
        strokeLinejoin="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: drawS, ease: EASE_CINE }}
      />

      {BIDS.map((bid, index) => {
        const cx = xOf(bid.t);
        const cy = yOf(START + STEP * (index + 1));
        const delay = (bid.t / 100) * drawS * 0.92;
        const you = bid.who === 'Vos';
        return (
          <motion.g
            key={`${bid.t}-${bid.who}`}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay }}
          >
            <circle cx={cx} cy={cy} r="3.5" fill={you ? '#fff' : '#9db3fa'} />
            <text x={cx} y={cy - 12} textAnchor="middle" fontSize="10.5" fill={you ? '#fff' : 'rgba(255,255,255,0.5)'}>
              {bid.who}
            </text>
          </motion.g>
        );
      })}

      {/* Cierre: línea vertical y precio de adjudicación. */}
      <motion.g
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay: drawS + 0.1 }}
      >
        <line x1={xOf(97)} x2={xOf(97)} y1={30} y2={H - PAD.b} stroke="#c8a45d" strokeWidth="1" />
        <circle cx={xOf(97)} cy={yOf(final)} r="5" fill="#c8a45d" />
        <text x={xOf(97) - 10} y={18} textAnchor="end" fontSize="12" fill="#c8a45d">
          Adjudicado · {formatUsd(final)}
        </text>
      </motion.g>
    </svg>
  );
}

/**
 * Funciones del sistema. Arriba, "tiempo real" se explica con un gráfico que se dibuja; abajo, las
 * otras ocho en una grilla de líneas finas donde cada celda se ilumina con el cursor.
 */
export function Features() {
  const [realtime, ...others] = FEATURES;

  return (
    <section id="caracteristicas" className="lv4-night py-24 sm:py-32 lg:py-44">
      <Shell>
        <SplitHeading
          lines={['Todo lo que necesitás', 'para rematar.']}
          className="lv4-serif text-[clamp(2.8rem,6.4vw,6.2rem)] leading-[0.95]"
        />

        <div className="mt-16 grid items-center gap-12 border-t border-white/15 pt-12 lg:mt-24 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20 lg:pt-16">
          <Reveal>
            <realtime.icon className="h-6 w-6 text-[var(--lv4-cobalt-soft)]" strokeWidth={1.25} aria-hidden="true" />
            <h3 className="lv4-serif mt-6 text-[clamp(2.2rem,4vw,3.4rem)] leading-[1]">{realtime.title}</h3>
            <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-white/65">{realtime.description}</p>
            <p className="mt-8 border-l border-[var(--lv4-brass)] pl-4 text-[14px] leading-relaxed text-white/55">
              Ejemplo de un lote: diez ofertas, dos de ellas tuyas, y el martillo cae al final.
            </p>
          </Reveal>
          <div className="border border-white/12 bg-[var(--lv4-ink)]/60 p-4 sm:p-8">
            <BidChart />
          </div>
        </div>

        <div className="mt-20 grid border-l border-white/12 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -6% 0px' }}
              transition={{ duration: 0.9, ease: EASE_OUT, delay: (index % 4) * 0.07 }}
              className="border-b border-r border-t border-white/12"
            >
              <Spot className="group relative h-full p-7 sm:p-8">
                <span className="absolute inset-x-0 top-[-1px] block h-px origin-left scale-x-0 bg-white transition-transform duration-700 [transition-timing-function:var(--lv4-ease)] group-hover:scale-x-100" />
                <feature.icon
                  className="h-[22px] w-[22px] text-white/55 transition-[color,transform] duration-500 [transition-timing-function:var(--lv4-ease)] group-hover:-translate-y-1 group-hover:text-[var(--lv4-cobalt-soft)]"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <h3 className="mt-10 text-[17px] font-medium leading-snug">{feature.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/55">{feature.description}</p>
              </Spot>
            </motion.div>
          ))}
        </div>
      </Shell>
    </section>
  );
}
