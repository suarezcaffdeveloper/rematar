import { Reveal } from '../../../shared/components/Reveal';
import { TIMELINE_STEPS } from '../data';

/**
 * Línea de tiempo "Cómo funciona": vertical, con conector continuo detrás de los
 * números -- funciona igual de bien en mobile (una columna) que en desktop.
 */
export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="bg-slate-50 py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Cómo funciona
          </h2>
          <p className="mt-4 text-lg text-slate-600">De la creación del remate a la adjudicación del lote.</p>
        </Reveal>

        <ol className="relative mt-16 space-y-10">
          <div aria-hidden="true" className="absolute left-6 top-2 h-[calc(100%-2rem)] w-px bg-slate-200" />
          {TIMELINE_STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.08}>
              <li className="relative flex items-start gap-6 pl-0">
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white shadow-sm">
                  {step.number}
                </span>
                <div className="pt-2">
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{step.description}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
