import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Reveal } from '../../../shared/components/Reveal';
import { FAQ_GROUPS } from '../data';

/**
 * Sección de preguntas frecuentes de la landing -- formato acordeón (una pregunta
 * abierta a la vez) para no abrumar al visitante. Agrupadas por audiencia ("Para
 * compradores", "Para empresas", etc.) para que cada rol encuentre rápido lo suyo.
 *
 * Posicionada después de `FeaturesSection` y antes de `CTASection`: es la última
 * barrera de objeciones antes del llamado a la acción (patrón estándar en landing
 * B2B). El ancla `#faq` está registrada en `NAV_LINKS` (`data.ts`) con el mismo
 * scroll suave que el resto de las secciones (`LandingNavbar`/`LandingFooter`).
 */
export function FaqSection() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  function toggle(key: string) {
    setOpenKey((current) => (current === key ? null : key));
  }

  return (
    <section id="faq" className="bg-slate-50 py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Todo lo que necesitás saber antes de empezar, según tu rol.
          </p>
        </Reveal>

        <div className="mt-12 flex flex-col gap-10">
          {FAQ_GROUPS.map((group, groupIndex) => (
            <Reveal key={group.eyebrow} delay={groupIndex * 0.06}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                  {group.eyebrow}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {group.items.map((item) => {
                    const key = `${group.eyebrow}-${item.question}`;
                    const isOpen = openKey === key;

                    return (
                      <div
                        key={item.question}
                        className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                        >
                          <span className="text-sm font-semibold text-slate-900">{item.question}</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={clsx(
                              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
                        <div
                          className={clsx(
                            'grid transition-all duration-200 ease-out',
                            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                          )}
                        >
                          <div className="overflow-hidden">
                            <p className="px-5 pb-4 text-sm leading-relaxed text-slate-600">
                              {item.answer}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
