import { Reveal } from '../../../shared/components/Reveal';
import { BACKEND_TECH, FRONTEND_TECH, type TechItem } from '../data';

function TechGrid({ title, items }: { title: string; items: TechItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4">
        {items.map((tech, index) => (
          <Reveal key={tech.name} delay={index * 0.05}>
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md">
              <tech.icon className="h-7 w-7 text-brand-600" />
              <span className="text-xs font-medium text-slate-600">{tech.name}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

/** Sección "Tecnologías": backend y frontend, en grillas separadas, íconos grandes. */
export function TechStackSection() {
  return (
    <section id="tecnologias" className="bg-slate-50 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Tecnologías
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Un stack moderno, pensado para tiempo real y escalabilidad.
          </p>
        </Reveal>

        <div className="mt-16 space-y-14">
          <TechGrid title="Backend" items={BACKEND_TECH} />
          <TechGrid title="Frontend" items={FRONTEND_TECH} />
        </div>
      </div>
    </section>
  );
}
