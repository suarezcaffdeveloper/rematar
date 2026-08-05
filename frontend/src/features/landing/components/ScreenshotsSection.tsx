import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Reveal } from '../../../shared/components/Reveal';
import { MockupWindow } from './MockupWindow';
import { SYSTEM_SCREENS } from '../data';

/**
 * Slider de "capturas del sistema": scroll horizontal nativo con `scroll-snap` (soporte
 * táctil gratis en mobile) más botones prev/next que desplazan con `scrollIntoView`
 * suave. Capturas reales de la app corriendo (`public/screenshots/`, ver
 * `SYSTEM_SCREENS` en `../data.ts`), enmarcadas con `MockupWindow` para que se vean
 * parte del mismo sistema visual que el resto de la landing.
 */
export function ScreenshotsSection() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function scrollToIndex(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const clamped = Math.max(0, Math.min(SYSTEM_SCREENS.length - 1, index));
    const child = scroller.children[clamped] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActiveIndex(clamped);
  }

  return (
    <section id="demo" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Capturas del sistema
        </h2>
        <p className="mt-4 text-lg text-slate-600">
          Un vistazo real a las pantallas que ven compradores y rematadores.
        </p>
      </Reveal>

      <div className="relative mt-14">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SYSTEM_SCREENS.map((screen) => (
            <div key={screen.key} className="w-full shrink-0 snap-start sm:w-[36rem]">
              <MockupWindow urlLabel={`app.rematar.com/${screen.key}`} noPadding>
                <img
                  src={screen.image}
                  alt={screen.title}
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover object-top"
                />
              </MockupWindow>
              <div className="mt-4 text-center">
                <p className="text-sm font-semibold text-slate-900">{screen.title}</p>
                <p className="text-sm text-slate-500">{screen.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            aria-label="Pantalla anterior"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-2">
            {SYSTEM_SCREENS.map((screen, index) => (
              <button
                key={screen.key}
                type="button"
                aria-label={`Ir a ${screen.title}`}
                onClick={() => scrollToIndex(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex ? 'w-6 bg-brand-600' : 'w-1.5 bg-slate-300'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            aria-label="Pantalla siguiente"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
