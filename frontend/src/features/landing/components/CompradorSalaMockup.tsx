import { MockupWindow } from './MockupWindow';

/**
 * Visual de la sección "Beneficios para compradores" (`BenefitsSection`) -- captura
 * real de la sala en vivo desde la vista del comprador (oferta actual, tiempo
 * restante y chat), no una recreación (ver
 * `public/screenshots/sala-en-vivo.png`).
 */
export function CompradorSalaMockup() {
  return (
    <MockupWindow urlLabel="app.rematar.com/remates/sala" noPadding>
      <img
        src="/screenshots/sala-en-vivo.png"
        alt="Sala en vivo desde la vista del comprador: oferta actual, tiempo restante y chat"
        loading="lazy"
        className="aspect-[16/10] w-full object-cover object-top"
      />
    </MockupWindow>
  );
}
