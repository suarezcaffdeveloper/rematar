import { type ReactNode, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { STOCK_PHOTOS } from '../../shared/media/stockPhotos';
import {
  COMPRADOR_BENEFITS,
  EMPRESA_BENEFITS,
  REMATADOR_BENEFITS,
  type BenefitItem,
} from '../../features/landing/data';
import { EmpresaMockup } from '../../features/landing/components/EmpresaMockup';
import { RematadorMockup } from '../../features/landing/components/RematadorMockup';
import { CompradorMockup } from '../../features/landing/components/CompradorMockup';
import { EASE, useMediaQuery } from '../lib';

interface Role {
  key: string;
  name: string;
  headline: string;
  description: string;
  benefits: BenefitItem[];
  photo: string;
  mockup: ReactNode;
}

const ROLES: Role[] = [
  {
    key: 'empresa',
    name: 'Empresa',
    headline: 'Administrá tus remates, lotes y resultados.',
    description:
      'El backoffice de la empresa: creá eventos, cargá catálogos, asigná martilleros y seguí adjudicaciones y ventas post-remate.',
    benefits: EMPRESA_BENEFITS,
    photo: STOCK_PHOTOS.maquinariaPesada.url,
    mockup: <EmpresaMockup />,
  },
  {
    key: 'martillero',
    name: 'Martillero',
    headline: 'Conducí el remate en vivo.',
    description:
      'Entrá con tus credenciales directo a la consola operativa, conducí el evento en tiempo real y terminá tu trabajo al cerrar.',
    benefits: REMATADOR_BENEFITS,
    photo: STOCK_PHOTOS.antiguedades.url,
    mockup: <RematadorMockup />,
  },
  {
    key: 'comprador',
    name: 'Comprador',
    headline: 'Participá sin perderte nada.',
    description:
      'Todo lo que un comprador necesita para seguir un remate y ofertar con confianza, desde cualquier dispositivo.',
    benefits: COMPRADOR_BENEFITS,
    photo: STOCK_PHOTOS.vehiculos.url,
    mockup: <CompradorMockup />,
  },
];

/** Escenario del mockup: fotografía del rubro desenfocada detrás y la ventana de la app encima. */
function Stage({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] ring-1 ring-white/15">
      <img src={role.photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--lv2-night)]/70 via-[var(--lv2-night)]/55 to-brand-900/60" />
      <div className="relative px-5 py-10 sm:px-12 sm:py-16">{children}</div>
    </div>
  );
}

function BenefitList({ benefits, compact = false }: { benefits: BenefitItem[]; compact?: boolean }) {
  return (
    <ul className={`grid gap-x-8 gap-y-5 ${compact ? 'sm:grid-cols-2' : 'grid-cols-2'}`}>
      {benefits.slice(0, 4).map((benefit) => (
        <li key={benefit.title} className="flex gap-3">
          <benefit.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-300" aria-hidden="true" />
          <div>
            <p className="text-[15px] font-semibold text-white">{benefit.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/60">{benefit.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Mobile y tablet: los tres roles apilados, uno debajo del otro. */
function StackedRoles() {
  return (
    <div className="mt-16 space-y-24">
      {ROLES.map((role) => (
        <article key={role.key}>
          <p className="text-sm font-medium text-brand-300">{role.name}</p>
          <h3 className="lv2-serif mt-3 text-4xl font-light leading-[1.05] tracking-tight">{role.headline}</h3>
          <p className="mt-4 text-[16px] leading-relaxed text-white/65">{role.description}</p>
          <div className="mt-8">
            <Stage role={role}>{role.mockup}</Stage>
          </div>
          <div className="mt-8">
            <BenefitList benefits={role.benefits} compact />
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Escritorio: la sección queda fija en pantalla mientras se scrollea y va pasando por los tres
 * roles. El avance del scroll decide qué rol está activo; hacer clic en uno lleva el scroll
 * hasta su tramo.
 */
function PinnedRoles() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    setActive(Math.min(ROLES.length - 1, Math.max(0, Math.floor(progress * ROLES.length))));
  });

  const jumpTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const scrollable = track.offsetHeight - window.innerHeight;
    const top = track.getBoundingClientRect().top + window.scrollY + ((index + 0.5) / ROLES.length) * scrollable;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const role = ROLES[active];

  return (
    <div ref={trackRef} className="relative mt-10" style={{ height: `${ROLES.length * 95}vh` }}>
      <div className="sticky top-0 flex h-screen items-center">
        <div className="grid w-full grid-cols-[0.82fr_1.18fr] items-center gap-16 xl:gap-24">
          <div>
            <ul className="space-y-1" aria-label="Roles">
              {ROLES.map((item, index) => {
                const isActive = index === active;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      aria-current={isActive}
                      className="group flex items-center gap-4 py-1.5 text-left"
                    >
                      <span
                        className={`h-px transition-all duration-500 ${isActive ? 'w-14 bg-brand-400' : 'w-5 bg-white/30 group-hover:w-9'}`}
                      />
                      <span
                        className={`lv2-serif text-5xl font-light tracking-tight transition-colors duration-500 xl:text-6xl ${
                          isActive ? 'text-white' : 'text-white/30 group-hover:text-white/60'
                        }`}
                      >
                        {item.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-10 min-h-[21rem] border-t border-white/15 pt-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={role.key}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <h3 className="text-xl font-semibold leading-snug">{role.headline}</h3>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/65">{role.description}</p>
                  <div className="mt-7 max-w-lg">
                    <BenefitList benefits={role.benefits} />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={role.key}
                initial={{ opacity: 0, scale: 0.96, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -16 }}
                transition={{ duration: 0.65, ease: EASE }}
              >
                <Stage role={role}>{role.mockup}</Stage>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Roles() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <section id="plataforma" className="lv2-night relative px-5 pt-28 text-white sm:px-8 sm:pt-36 lg:px-12">
      <div className="mx-auto max-w-[96rem] pb-24">
        <h2 className="lv2-serif max-w-4xl text-[clamp(2.4rem,5.6vw,5.6rem)] font-light leading-[1] tracking-[-0.02em]">
          Tres personas, un mismo remate.
        </h2>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/65">
          Cada rol tiene su propio panel, con solo lo que necesita ver. Todos trabajan sobre el mismo evento, al
          mismo tiempo.
        </p>
        {isDesktop ? <PinnedRoles /> : <StackedRoles />}
      </div>
    </section>
  );
}
