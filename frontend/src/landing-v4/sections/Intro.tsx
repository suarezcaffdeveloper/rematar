import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import logoRematar from '../../assets/brand/logo-rematar.png';
import { EASE_CINE, INTRO_S } from '../lib';

/**
 * Apertura de 1,9 s: pantalla negra, la marca y una línea que se dibuja; después las dos mitades
 * se abren (como una claqueta o un telón) y descubren el hero. Bloquea el scroll mientras corre
 * y se omite con `prefers-reduced-motion`.
 */
export function Intro() {
  const reduce = useReducedMotion();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reduce) return;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      document.body.style.overflow = '';
      setDone(true);
    }, INTRO_S * 1000);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = '';
    };
  }, [reduce]);

  if (reduce) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[60]" aria-hidden="true">
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: '-100%' }}
            transition={{ duration: 0.95, ease: EASE_CINE, delay: 1 }}
            className="absolute inset-x-0 top-0 h-1/2 bg-[var(--lv4-ink)]"
          />
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: '100%' }}
            transition={{ duration: 0.95, ease: EASE_CINE, delay: 1 }}
            className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--lv4-ink)]"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.2, times: [0, 0.3, 0.75, 1], ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
          >
            <img src={logoRematar} alt="" className="h-9 w-auto brightness-0 invert" />
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, ease: EASE_CINE, delay: 0.15 }}
              className="block h-px w-40 origin-left bg-white/60"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
