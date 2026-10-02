import { motion, useScroll, useSpring } from 'framer-motion';
import { Intro } from './sections/Intro';
import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { Tape } from './sections/Tape';
import { Statement } from './sections/Statement';
import { Rubros } from './sections/Rubros';
import { Roles } from './sections/Roles';
import { Process } from './sections/Process';
import { Showcase } from './sections/Showcase';
import { Features } from './sections/Features';
import { Faq } from './sections/Faq';
import { Closing } from './sections/Closing';

/**
 * Landing pública de RematAR, opción B (v4): cinematográfica con lectura editorial. Fotografía a
 * pantalla completa, serif de alto contraste (Instrument Serif) y líneas finas, con grano de
 * película y una apertura corta tipo claqueta. Mismo contrato que `LandingPage` (sin props,
 * contenido estático, destino de los CTA vía `LandingCtaContext`).
 *
 * Ritmo: noche (hero, cinta) -> papel (texto) -> noche (rubros) -> papel (roles) -> noche
 * (proceso) -> papel (pantallas) -> noche (funciones) -> papel (FAQ) -> noche (cierre).
 */
export function LandingV4() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.3 });

  return (
    <div className="lv4-root">
      <div className="lv4-grain" aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        style={{ scaleX }}
        className="fixed inset-x-0 top-0 z-50 h-px origin-left bg-white mix-blend-difference"
      />
      <Intro />
      <Nav />
      <main>
        <Hero />
        <Tape />
        <Statement />
        <Rubros />
        <Roles />
        <Process />
        <Showcase />
        <Features />
        <Faq />
      </main>
      <Closing />
    </div>
  );
}
