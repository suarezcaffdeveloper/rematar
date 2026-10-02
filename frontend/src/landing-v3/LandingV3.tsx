import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { Manifesto } from './sections/Manifesto';
import { Rubros } from './sections/Rubros';
import { Roles } from './sections/Roles';
import { Showcase } from './sections/Showcase';
import { Process } from './sections/Process';
import { Features } from './sections/Features';
import { Faq } from './sections/Faq';
import { Closing } from './sections/Closing';

/**
 * Landing pública de RematAR, rediseño editorial/cinematográfico (v3). Mismo contrato que
 * `LandingPage` (sin props, contenido estático, destino de los CTA vía `LandingCtaContext`).
 * Ritmo de la página: noche (hero) -> papel (¿qué es?) -> noche (rubros, roles) -> papel
 * (capturas) -> noche (proceso) -> papel (funcionalidades, FAQ) -> noche (cierre), con una
 * capa de grano de película fija sobre toda la página.
 */
export function LandingV3() {
  return (
    <div className="lv3-root font-display">
      <div className="lv3-grain-fixed" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <Rubros />
        <Roles />
        <Showcase />
        <Process />
        <Features />
        <Faq />
      </main>
      <Closing />
    </div>
  );
}
