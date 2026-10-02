import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { FAQ_GROUPS } from '../../features/landing/data';
import { EASE } from '../lib';

export function Faq() {
  const [group, setGroup] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const current = FAQ_GROUPS[group];

  return (
    <section id="faq" className="lv2-paper relative border-t border-line-strong px-5 py-28 sm:px-8 sm:py-36 lg:px-12">
      <div className="mx-auto grid max-w-[96rem] gap-14 lg:grid-cols-[1fr_1.4fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <h2 className="lv2-serif text-[clamp(2.4rem,5vw,5rem)] font-light leading-[1] tracking-[-0.02em] text-ink">
            Preguntas frecuentes.
          </h2>
          <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-ink-muted">
            Elegí quién sos y encontrá lo que suele preguntar cada uno.
          </p>
          <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Preguntas por perfil">
            {FAQ_GROUPS.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                role="tab"
                aria-selected={index === group}
                onClick={() => {
                  setGroup(index);
                  setOpen(0);
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  index === group
                    ? 'bg-ink text-white'
                    : 'bg-white text-ink-muted ring-1 ring-line-strong hover:text-ink hover:ring-ink-faint'
                }`}
              >
                {item.eyebrow.replace('Para ', '').replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.ul
            key={group}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="divide-y divide-line-strong border-y border-line-strong"
          >
            {current.items.map((item, index) => {
              const isOpen = open === index;
              return (
                <li key={item.question}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="group flex w-full items-start justify-between gap-6 py-7 text-left"
                  >
                    <span className="lv2-serif text-[1.65rem] font-normal leading-[1.2] tracking-tight text-ink sm:text-[1.85rem]">
                      {item.question}
                    </span>
                    <span
                      className={`mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition-all duration-300 ${
                        isOpen ? 'rotate-45 bg-ink text-white ring-ink' : 'text-ink ring-line-strong group-hover:ring-ink'
                      }`}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-2xl pb-8 text-[16px] leading-relaxed text-ink-muted">{item.answer}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      </div>
    </section>
  );
}
