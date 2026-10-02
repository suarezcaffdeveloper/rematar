import { useState } from 'react';
import { motion } from 'framer-motion';
import { RUBRO_PANELS } from '../data';
import { EASE, useMediaQuery } from '../lib';

/**
 * Galería de rubros. En escritorio es un acordeón de paneles verticales: el que está bajo el
 * cursor (o con foco) se abre y muestra su rubro, los demás quedan como tiras de fotografía.
 * En mobile pasa a un carril horizontal con snap, porque ahí no existe el hover.
 */
export function Rubros() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [active, setActive] = useState(0);

  return (
    <section id="rubros" className="lv2-night lv2-grain relative px-5 py-28 text-white sm:px-8 sm:py-36 lg:px-12">
      <div className="mx-auto max-w-[96rem]">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <h2 className="lv2-serif text-[clamp(2.4rem,5.6vw,5.6rem)] font-light leading-[1] tracking-[-0.02em]">
            Todo lo que se remata, en una sola sala.
          </h2>
          <p className="max-w-md text-[17px] leading-relaxed text-white/65 lg:justify-self-end">
            Inmuebles, hacienda, maquinaria, arte o mercadería: cada rubro usa el mismo sistema, con el
            mismo nivel de detalle en el lote y la misma sala en vivo.
          </p>
        </div>

        {isDesktop ? (
          <div className="mt-16 flex h-[34rem] gap-2.5" onMouseLeave={() => setActive(0)}>
            {RUBRO_PANELS.map((rubro, index) => {
              const open = index === active;
              return (
                <motion.button
                  key={rubro.key}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  aria-label={rubro.name}
                  aria-pressed={open}
                  animate={{ flexGrow: open ? 6 : 1 }}
                  transition={{ duration: 0.75, ease: EASE }}
                  className="relative min-w-0 flex-1 basis-0 overflow-hidden rounded-2xl text-left"
                >
                  <img
                    src={rubro.photo.url}
                    alt={rubro.photo.alt}
                    loading="lazy"
                    className={`absolute inset-0 h-full w-full object-cover transition-[transform,filter] duration-[900ms] ${
                      open ? 'scale-100 saturate-100' : 'scale-110 saturate-[0.55]'
                    }`}
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />

                  {!open && (
                    <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm font-medium text-white/85 [writing-mode:vertical-rl] rotate-180">
                      {rubro.name}
                    </span>
                  )}

                  {open && (
                    <motion.span
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
                      className="absolute inset-x-0 bottom-0 block p-7"
                    >
                      <span className="lv2-serif block text-4xl font-light leading-tight tracking-tight">
                        {rubro.name}
                      </span>
                      <span className="mt-2 block text-[15px] text-white/75">{rubro.example}</span>
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        ) : (
          <ul className="lv2-noscrollbar -mx-5 mt-12 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8">
            {RUBRO_PANELS.map((rubro) => (
              <li
                key={rubro.key}
                className="relative aspect-[3/4] w-[72vw] max-w-[20rem] shrink-0 snap-start overflow-hidden rounded-2xl"
              >
                <img src={rubro.photo.url} alt={rubro.photo.alt} loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-5">
                  <span className="lv2-serif block text-3xl font-light leading-tight">{rubro.name}</span>
                  <span className="mt-1 block text-sm text-white/75">{rubro.example}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
