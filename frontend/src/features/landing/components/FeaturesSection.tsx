import { Reveal } from '../../../shared/components/Reveal';
import { FEATURES } from '../data';

/** Grilla de características principales, cards con hover suave. */
export function FeaturesSection() {
  return (
    <section id="caracteristicas" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Todo lo que necesitás para gestionar remates profesionales
        </h2>
        <p className="mt-4 text-lg text-slate-600">De la creación del evento a la entrega del lote, en un mismo lugar.</p>
      </Reveal>

      <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 0.08}>
            <div className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{feature.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
