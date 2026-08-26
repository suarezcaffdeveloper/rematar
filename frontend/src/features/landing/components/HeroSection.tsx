import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, MessageSquare, TrendingUp } from 'lucide-react';
import { MockupWindow } from './MockupWindow';
import { AnimatedCounter } from './AnimatedCounter';
import { useLandingCta } from '../ctaContext';

const OFERTAS = [
  { comprador: 'Comprador #214', monto: '$18.500' },
  { comprador: 'Comprador #087', monto: '$19.000' },
  { comprador: 'Comprador #214', monto: '$19.400' },
];

function FloatingCard({
  children,
  className,
  floatDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  floatDelay?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      className={`absolute ${className}`}
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={
        prefersReducedMotion
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 1, y: [0, -10, 0], scale: 1 }
      }
      transition={
        prefersReducedMotion
          ? { duration: 0.6, delay: floatDelay }
          : {
              opacity: { duration: 0.45, delay: floatDelay },
              scale: { duration: 0.45, delay: floatDelay },
              y: { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: floatDelay + 0.45 },
            }
      }
    >
      {children}
    </motion.div>
  );
}

/**
 * Sección Hero: título + subtítulo + CTAs a la izquierda, composición de ventanas
 * flotantes ("ofertando", "panel del rematador", "chat", "oferta ganadora") a la
 * derecha -- recreadas con los mismos tokens visuales de la app real (`MockupWindow`)
 * en vez de una captura estática, para poder animarlas.
 */
export function HeroSection() {
  const cta = useLandingCta();

  return (
    <section
      id="inicio"
      className="relative flex min-h-screen items-center overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white pt-28 pb-16"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-brand-100/60 blur-3xl" />
      </div>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          
          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            La nueva generación de <span className="text-brand-600">remates en tiempo real</span>.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            RematAR permite organizar, administrar y participar en remates online de
            manera segura, profesional y completamente en tiempo real.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            {cta.external ? (
              <a
                href={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
              >
                {cta.label}
              </a>
            ) : (
              <Link
                to={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
              >
                {cta.label}
              </Link>
            )}
            <a
              href="#plataforma"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50"
            >
              Ver la plataforma <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-6 border-t border-slate-200 pt-8">
            <div>
              <p className="text-2xl font-bold text-slate-900">
                <AnimatedCounter value={100} suffix="%" />
              </p>
              <p className="mt-1 text-sm text-slate-500">Tiempo real</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                <AnimatedCounter value={9} />
              </p>
              <p className="mt-1 text-sm text-slate-500">Rubros soportados</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                <AnimatedCounter value={3} />
              </p>
              <p className="mt-1 text-sm text-slate-500">Roles, un mismo remate</p>
            </div>
          </div>
        </motion.div>

        <div className="relative mx-auto hidden h-[30rem] w-full max-w-lg lg:block">
          <FloatingCard className="left-0 top-0 w-72" floatDelay={0.2}>
            <MockupWindow urlLabel="app.rematar.com/sala/lote-14">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Ofertas en vivo
              </p>
              <div className="space-y-2">
                {OFERTAS.map((oferta, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100"
                  >
                    <span className="text-xs text-slate-500">{oferta.comprador}</span>
                    <span className="text-sm font-semibold text-brand-700">{oferta.monto}</span>
                  </div>
                ))}
              </div>
            </MockupWindow>
          </FloatingCard>

          <FloatingCard className="right-0 top-16 w-64" floatDelay={0.5}>
            <MockupWindow urlLabel="Consola operativa">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Lote #14 · Toro Angus
              </p>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-danger-500" />
                <span className="text-lg font-bold tabular-nums text-slate-900">00:24</span>
                <span className="text-xs text-slate-400">restantes</span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-2/3 rounded-full bg-brand-600" />
              </div>
            </MockupWindow>
          </FloatingCard>

          <FloatingCard className="bottom-16 left-6 w-64" floatDelay={0.8}>
            <MockupWindow urlLabel="Chat del remate">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                <MessageSquare className="h-3.5 w-3.5" /> Chat
              </p>
              <div className="space-y-1.5 text-xs">
                <p className="rounded-lg bg-white px-2.5 py-1.5 text-slate-600 shadow-sm">
                  ¿Incluye flete el lote 14?
                </p>
                <p className="ml-6 rounded-lg bg-brand-600 px-2.5 py-1.5 text-white shadow-sm">
                  Sí, dentro del radio pactado.
                </p>
              </div>
            </MockupWindow>
          </FloatingCard>

          <FloatingCard className="bottom-0 right-4 w-60" floatDelay={1.1}>
            <MockupWindow>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-100 text-success-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs text-slate-400">Oferta ganadora</p>
                  <p className="flex items-center gap-1 text-base font-bold text-slate-900">
                    $19.400 <TrendingUp className="h-3.5 w-3.5 text-success-600" />
                  </p>
                </div>
              </div>
            </MockupWindow>
          </FloatingCard>
        </div>
      </div>
    </section>
  );
}
