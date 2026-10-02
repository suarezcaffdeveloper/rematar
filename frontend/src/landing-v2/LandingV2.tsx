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
 * Ejemplo de rediseño de la landing pública. Mismo contrato que `LandingPage` (sin props, todo
 * el contenido estático, destino de los CTA vía `LandingCtaContext`), así que reemplazarla es
 * cambiar un import. Ritmo de la página: oscuro cinematográfico (hero) -> papel editorial
 * (manifiesto) -> oscuro (rubros, roles) -> papel (capturas) -> oscuro (proceso) -> papel
 * (funcionalidades, FAQ) -> oscuro (cierre).
 */
export function LandingV2() {
  return (
    <div className="lv2-root font-display">
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
