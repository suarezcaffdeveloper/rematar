import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '../../../shared/components/Reveal';
import { useLandingCta } from '../ctaContext';

/** Llamado a la acción grande antes del footer. */
export function CTASection() {
  const cta = useLandingCta();

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-8 py-16 text-center shadow-xl sm:px-16">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            ¿Listo para tu primer remate?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-brand-100">
            Creá tu cuenta, armá tu catálogo y viví la puja en tiempo real.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {cta.external ? (
              <a
                href={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-50"
              >
                {cta.label}
              </a>
            ) : (
              <Link
                to={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-50"
              >
                {cta.label}
              </Link>
            )}
            <a
              href="#plataforma"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/10"
            >
              Ver la plataforma <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
