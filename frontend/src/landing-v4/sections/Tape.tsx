import { useRef } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import { TAPE_RESULTS } from '../data';
import { formatUsd } from '../lib';

function wrap(min: number, max: number, value: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

/**
 * Cinta de cierres, como la de una bolsa: corre sola y reacciona al scroll (se acelera y se
 * invierte según el sentido). El contenido se repite dos veces para que el bucle sea continuo.
 */
export function Tape() {
  const reduce = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 4], { clamp: false });
  const direction = useRef(1);
  const x = useTransform(baseX, (value) => `${wrap(-50, 0, value)}%`);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const f = factor.get();
    if (f < 0) direction.current = -1;
    else if (f > 0) direction.current = 1;
    baseX.set(baseX.get() - direction.current * 1.6 * (delta / 1000) * (1 + Math.abs(f)));
  });

  const items = (
    <div className="flex shrink-0 items-center">
      {TAPE_RESULTS.map((item) => (
        <div key={item.lote} className="flex items-center gap-4 pr-12 text-[14px] sm:pr-16">
          <span className="text-white/85">{item.lote}</span>
          <span className="text-white/40">{item.rubro}</span>
          <span className="lv4-num font-medium text-[var(--lv4-brass)]">{formatUsd(item.precio)}</span>
          <span aria-hidden="true" className="ml-8 h-3 w-px bg-white/20 sm:ml-12" />
        </div>
      ))}
    </div>
  );

  return (
    <section aria-label="Cierres de ejemplo" className="lv4-dark relative border-y border-white/10">
      <div className="flex h-14 items-center overflow-hidden">
        <div className="relative z-10 hidden h-full shrink-0 items-center bg-[var(--lv4-ink)] pl-8 pr-10 text-[13px] text-white/55 shadow-[24px_0_24px_-8px_var(--lv4-ink)] md:flex lg:pl-14">
          Así cierra un lote
        </div>
        <motion.div style={{ x }} className="flex w-max items-center will-change-transform">
          {items}
          <div aria-hidden="true" className="flex shrink-0 items-center">
            {items}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
