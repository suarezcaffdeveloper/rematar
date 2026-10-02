import { useState } from 'react';
import { motion } from 'framer-motion';
import { FAQ_GROUPS } from '../../features/landing/data';
import { EASE_OUT, PrimaryCta, Reveal, Shell, SplitHeading } from '../lib';

/**
 * Preguntas frecuentes por audiencia, a dos columnas. Las pestañas subrayan con una línea que se
 * desliza y las respuestas se despliegan con una transición de filas (sin medir alturas en JS).
 */
export function Faq() {
  const [group, setGroup] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const current = FAQ_GROUPS[group];

  const selectGroup = (index: number) => {
    setGroup(index);
    setOpen(0);
  };

  return (
    <section id="faq" className="lv4-paper py-24 sm:py-32 lg:py-44">
      <Shell>
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SplitHeading
              lines={['Preguntas', 'frecuentes.']}
              className="lv4-serif text-[clamp(2.8rem,6vw,5.6rem)] leading-[0.95]"
            />
            <Reveal delay={0.2} className="mt-10 max-w-sm">
              <p className="text-[17px] leading-relaxed text-[var(--lv4-ink)]/65">
                ¿Seguís con dudas? Coordinamos una demo guiada con un remate de prueba.
              </p>
              <div className="mt-7">
                <PrimaryCta tone="dark" />
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal delay={0.1}>
              <div role="tablist" aria-label="Audiencia" className="flex flex-wrap gap-x-8 gap-y-2 border-b border-[var(--lv4-line-light)]">
                {FAQ_GROUPS.map((item, index) => (
                  <button
                    key={item.eyebrow}
                    type="button"
                    role="tab"
                    aria-selected={index === group}
                    onClick={() => selectGroup(index)}
                    className="relative pb-3 text-[14.5px]"
                  >
                    <span
                      className={`transition-colors duration-300 ${
                        index === group ? 'font-medium text-[var(--lv4-ink)]' : 'text-[var(--lv4-ink)]/50 hover:text-[var(--lv4-ink)]'
                      }`}
                    >
                      {item.eyebrow}
                    </span>
                    {index === group && (
                      <motion.span
                        layoutId="lv4-faq-line"
                        className="absolute inset-x-0 -bottom-px h-px bg-[var(--lv4-ink)]"
                        transition={{ type: 'spring', duration: 0.5, bounce: 0.1 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </Reveal>

            <motion.ul
              key={group}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="divide-y divide-[var(--lv4-line-light)] border-b border-[var(--lv4-line-light)]"
            >
              {current.items.map((item, index) => {
                const isOpen = open === index;
                const panelId = `lv4-faq-${group}-${index}`;
                return (
                  <li key={item.question}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? null : index)}
                      className="group flex w-full items-start justify-between gap-8 py-7 text-left"
                    >
                      <span className="lv4-serif text-[clamp(1.5rem,2.4vw,2.1rem)] leading-[1.1] transition-transform duration-500 [transition-timing-function:var(--lv4-ease)] group-hover:translate-x-1.5">
                        {item.question}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative mt-1.5 block h-5 w-5 shrink-0 transition-transform duration-700 [transition-timing-function:var(--lv4-ease)] ${isOpen ? 'rotate-45' : ''}`}
                      >
                        <span className="absolute left-0 top-1/2 h-px w-full bg-[var(--lv4-ink)]" />
                        <span className="absolute left-1/2 top-0 h-full w-px bg-[var(--lv4-ink)]" />
                      </span>
                    </button>
                    <div
                      id={panelId}
                      role="region"
                      className={`grid transition-[grid-template-rows,opacity] duration-700 [transition-timing-function:var(--lv4-ease)] ${
                        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="max-w-2xl pb-8 text-[16.5px] leading-relaxed text-[var(--lv4-ink)]/70">{item.answer}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </motion.ul>
          </div>
        </div>
      </Shell>
    </section>
  );
}
