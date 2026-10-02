import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FEATURES } from '../../features/landing/data';
import { STOCK_PHOTOS, type StockPhoto } from '../../shared/media/stockPhotos';
import { EASE, MaskLines, Reveal, useMediaQuery } from '../lib';

/** Una fotografía por funcionalidad, en el mismo orden que `FEATURES`. */
const PHOTOS: StockPhoto[] = [
  STOCK_PHOTOS.maquinariaPesada,
  STOCK_PHOTOS.antiguedades,
  STOCK_PHOTOS.inmuebles,
  STOCK_PHOTOS.joyas,
  STOCK_PHOTOS.tecnologia,
  STOCK_PHOTOS.nautica,
  STOCK_PHOTOS.ganado,
  STOCK_PHOTOS.indumentaria,
  STOCK_PHOTOS.campo,
];

/**
 * Funcionalidades como un índice de catálogo: una lista tipográfica grande donde la fila activa
 * se enciende y abre su descripción, mientras una fotografía fija a la derecha cambia con ella.
 * En mobile no hay hover, así que cada fila muestra su descripción siempre y se omite la foto.
 */
export function Features() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [active, setActive] = useState(0);

  return (
    <section id="caracteristicas" className="lv3-paper relative px-5 py-28 sm:px-8 sm:py-36 lg:px-12">
      <div className="mx-auto max-w-[96rem]">
        <h2 className="lv3-serif max-w-5xl text-[clamp(2.2rem,4.6vw,4.6rem)] font-light leading-[1.05] tracking-[-0.02em] text-ink">
          <MaskLines lines={['Todo lo que necesitás', 'para gestionar', 'remates profesionales.']} delay={0} />
        </h2>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
            De la creación del evento a la entrega del lote, en un mismo lugar.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-14 lg:grid-cols-[1.25fr_1fr] lg:gap-20">
          <ul className="border-t border-ink/80" onMouseLeave={() => undefined}>
            {FEATURES.map((feature, index) => {
              const open = !isDesktop || index === active;
              return (
                <li key={feature.title} className="border-b border-line-strong">
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onClick={() => setActive(index)}
                    aria-expanded={open}
                    className="group flex w-full items-start gap-5 py-5 text-left sm:gap-8 sm:py-6"
                  >
                    <feature.icon
                      className={`mt-2 h-5 w-5 shrink-0 transition-colors duration-300 sm:mt-3 ${
                        index === active || !isDesktop ? 'text-brand-600' : 'text-ink-faint'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`lv3-serif block text-[clamp(1.7rem,3.2vw,3rem)] font-light leading-[1.1] tracking-[-0.015em] transition-all duration-500 ${
                          index === active || !isDesktop
                            ? 'translate-x-0 text-ink'
                            : '-translate-x-0 text-ink/35 group-hover:text-ink/70'
                        }`}
                      >
                        {feature.title}
                      </span>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.span
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.45, ease: EASE }}
                            className="block overflow-hidden"
                          >
                            <span className="block max-w-xl pt-3 text-[16px] leading-relaxed text-ink-muted">
                              {feature.description}
                            </span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {isDesktop && (
            <div className="relative">
              <div className="sticky top-28 aspect-[4/5] overflow-hidden rounded-[2rem] bg-ink">
                <AnimatePresence mode="sync" initial={false}>
                  <motion.img
                    key={active}
                    src={PHOTOS[active].url}
                    alt={PHOTOS[active].alt}
                    loading="lazy"
                    initial={{ opacity: 0, scale: 1.08 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9, ease: EASE }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
                <p className="lv3-serif absolute bottom-6 left-7 right-7 text-3xl font-light leading-tight text-white">
                  {FEATURES[active].title}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
