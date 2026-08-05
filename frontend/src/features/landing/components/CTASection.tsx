import { Link } from 'react-router-dom';
import { ArrowRight, PlayCircle } from 'lucide-react';
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
            ¿Listo para conocer RematAR?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-brand-100">
            Descubrí cómo se ve un remate en tiempo real, de punta a punta.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#demo"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
            >
              <PlayCircle className="h-4 w-4" /> Probar Demo
            </a>
            {cta.external ? (
              <a
                href={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {cta.label} <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <Link
                to={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {cta.label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
