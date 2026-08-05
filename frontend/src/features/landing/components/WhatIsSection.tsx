import { Reveal } from '../../../shared/components/Reveal';
import { PhotoFrame } from '../../../shared/components/PhotoFrame';
import { RUBROS } from '../data';

/**
 * "¿Qué es RematAR?" -- texto breve seguido de una grilla de fotografías reales de
 * distintos rubros (ganado, maquinaria, inmuebles, vehículos...), para dejar claro de
 * entrada que la plataforma no está atada a un solo tipo de remate.
 */
export function WhatIsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          ¿Qué es RematAR?
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          RematAR es una plataforma para realizar remates online completos, con
          interacción en tiempo real entre compradores y rematadores. Desde la
          creación del evento hasta la adjudicación del último lote, todo sucede en
          vivo, en un mismo lugar.
        </p>
      </Reveal>

      <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {RUBROS.map((rubro, index) => (
          <Reveal key={rubro.label} delay={index * 0.06}>
            <PhotoFrame
              photo={rubro.photo}
              rounded="rounded-2xl"
              className="aspect-[3/4] transition-transform duration-300 hover:-translate-y-1"
              label={rubro.label}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
