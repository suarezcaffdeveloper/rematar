import { type ReactNode, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'framer-motion';
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
import { EASE, EASE_OUT, Reveal, Shell, SplitHeading, Tilt } from '../lib';

const AUTOPLAY_MS = 11_000;

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
      'Accedé con tus credenciales directo a la consola operativa, conducí el evento en tiempo real y terminá tu trabajo al cerrar.',
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

/**
 * Tres roles, un mismo remate. A la izquierda un índice editorial: el rol activo se despliega y
 * una línea fina avanza hacia el siguiente. A la derecha, la pantalla de ese rol sobre una foto.
 * Se pausa con el cursor encima y no corre fuera de pantalla ni con `prefers-reduced-motion`.
 */
export function Roles() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const progress = useMotionValue(0);

  useAnimationFrame((_, delta) => {
    const el = sectionRef.current;
    if (!el || paused || reduce) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const next = progress.get() + delta / AUTOPLAY_MS;
    if (next >= 1) {
      progress.set(0);
      setActive((current) => (current + 1) % ROLES.length);
    } else {
      progress.set(next);
    }
  });

  const select = (index: number) => {
    progress.set(0);
    setActive(index);
  };

  const role = ROLES[active];

  return (
    <section
      id="plataforma"
      ref={sectionRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="lv4-paper py-24 sm:py-32 lg:py-44"
    >
      <Shell>
        <SplitHeading
          lines={['Un panel para cada rol,', 'un mismo remate.']}
          className="lv4-serif max-w-[60rem] text-[clamp(2.8rem,6.4vw,6.2rem)] leading-[0.95]"
        />

        <div className="mt-16 grid items-start gap-14 lg:mt-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div role="tablist" aria-label="Roles" className="border-b border-[var(--lv4-line-light)]">
            {ROLES.map((item, index) => {
              const isActive = index === active;
              return (
                <Reveal key={item.key} delay={index * 0.08} y={18}>
                  <div className="relative border-t border-[var(--lv4-line-light)]">
                    {isActive && (
                      <motion.span
                        aria-hidden="true"
                        style={{ scaleX: progress }}
                        className="absolute inset-x-0 -top-px h-px origin-left bg-[var(--lv4-ink)]"
                      />
                    )}
                    <button
                      type="button"
                      role="tab"
                      id={`lv4-role-tab-${item.key}`}
                      aria-selected={isActive}
                      aria-controls={`lv4-role-panel-${item.key}`}
                      onClick={() => select(index)}
                      className="group flex w-full items-baseline justify-between gap-6 py-5 text-left sm:py-7"
                    >
                      <span
                        className={`lv4-serif text-[clamp(2.8rem,5.4vw,5rem)] leading-none transition-[color,transform] duration-700 [transition-timing-function:var(--lv4-ease)] ${
                          isActive ? 'translate-x-0 text-[var(--lv4-ink)]' : 'text-[var(--lv4-ink)]/30 group-hover:translate-x-2 group-hover:text-[var(--lv4-ink)]/70'
                        }`}
                      >
                        {item.name}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative block h-5 w-5 shrink-0 transition-transform duration-700 [transition-timing-function:var(--lv4-ease)] ${isActive ? 'rotate-45' : ''}`}
                      >
                        <span className="absolute left-0 top-1/2 h-px w-full bg-[var(--lv4-ink)]" />
                        <span className="absolute left-1/2 top-0 h-full w-px bg-[var(--lv4-ink)]" />
                      </span>
                    </button>
                    <div
                      id={`lv4-role-panel-${item.key}`}
                      role="tabpanel"
                      aria-labelledby={`lv4-role-tab-${item.key}`}
                      className={`grid transition-[grid-template-rows,opacity] duration-700 [transition-timing-function:var(--lv4-ease)] ${
                        isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="pb-9">
                          <p className="text-[17px] leading-relaxed text-[var(--lv4-ink)]/70">{item.description}</p>
                          <ul className="mt-7 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                            {item.benefits.map((benefit) => (
                              <li key={benefit.title} className="flex gap-3">
                                <benefit.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--lv4-cobalt)]" strokeWidth={1.25} aria-hidden="true" />
                                <div>
                                  <p className="text-[14.5px] font-medium">{benefit.title}</p>
                                  <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--lv4-ink)]/60">{benefit.description}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-28">
            <Tilt max={3}>
              <div className="relative overflow-hidden bg-[var(--lv4-ink)] shadow-[0_50px_100px_-40px_rgba(6,8,15,0.55)]">
                <AnimatePresence initial={false}>
                  <motion.img
                    key={role.photo}
                    src={role.photo}
                    alt=""
                    loading="lazy"
                    initial={{ opacity: 0, scale: 1.14 }}
                    animate={{ opacity: 1, scale: 1.03 }}
                    exit={{ opacity: 0 }}
                    transition={{ opacity: { duration: 1.1, ease: EASE }, scale: { duration: 12, ease: 'linear' } }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--lv4-ink)]/85 via-[var(--lv4-ink)]/70 to-[var(--lv4-night)]/90" />
                <div className="relative px-4 py-8 sm:px-10 sm:py-12">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={role.key}
                      initial={{ opacity: 0, y: 28 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -14 }}
                      transition={{ duration: 0.6, ease: EASE_OUT }}
                    >
                      {role.mockup}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </Tilt>
            <p className="mt-3 text-[13px] text-[var(--lv4-ink)]/50">{role.headline}</p>
          </div>
        </div>
      </Shell>
    </section>
  );
}
