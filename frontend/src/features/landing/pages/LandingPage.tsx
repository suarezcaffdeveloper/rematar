import { LandingNavbar } from '../components/LandingNavbar';
import { HeroSection } from '../components/HeroSection';
import { WhatIsSection } from '../components/WhatIsSection';
import { BenefitsSection } from '../components/BenefitsSection';
import { RematadorConsoleMockup } from '../components/RematadorConsoleMockup';
import { CompradorSalaMockup } from '../components/CompradorSalaMockup';
import { HowItWorksSection } from '../components/HowItWorksSection';
import { ScreenshotsSection } from '../components/ScreenshotsSection';
import { TechStackSection } from '../components/TechStackSection';
import { FeaturesSection } from '../components/FeaturesSection';
import { CTASection } from '../components/CTASection';
import { LandingFooter } from '../components/LandingFooter';
import { EMPRESA_BENEFITS, REMATADOR_BENEFITS, COMPRADOR_BENEFITS } from '../data';

/**
 * Landing pública de RematAR (portfolio) -- servida en la ruta "/" únicamente para
 * visitantes sin sesión (ver el branch dedicado en `shared/guards/RequireAuth.tsx`).
 * Una única página larga con navegación por anclas, sin datos ni llamadas a la API:
 * todo el contenido es estático (`features/landing/data.ts`).
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />
      <main>
        <HeroSection />
        <WhatIsSection />
        <BenefitsSection
          eyebrow="Para empresas"
          title="Administrá tus remates, lotes y resultados"
          description="El backoffice de la empresa: creá eventos, cargá catálogos, asigná rematadores y seguí adjudicaciones y ventas post-remate."
          benefits={EMPRESA_BENEFITS}
          visual={<RematadorConsoleMockup />}
        />
        <BenefitsSection
          eyebrow="Para rematadores"
          title="Conducí el remate en vivo"
          description="Accedé con tus credenciales directo a la consola operativa, conducí el evento en tiempo real y terminá tu trabajo al cerrar."
          benefits={REMATADOR_BENEFITS}
          visual={<RematadorConsoleMockup />}
          reverse
          className="bg-slate-50"
        />
        <BenefitsSection
          eyebrow="Para compradores"
          title="Participá sin perderte nada"
          description="Todo lo que un comprador necesita para seguir un remate y ofertar con confianza, desde cualquier dispositivo."
          benefits={COMPRADOR_BENEFITS}
          visual={<CompradorSalaMockup />}
        />
        <HowItWorksSection />
        <ScreenshotsSection />
        <TechStackSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
