import { MockupWindow } from './MockupWindow';

/**
 * Visual de la sección "Beneficios para rematadores" (`BenefitsSection`) -- captura
 * real del panel del rematador ("Mis remates": estado, lotes y accesos rápidos a
 * cada evento), no una recreación (ver `public/screenshots/panel-rematador.png`).
 */
export function RematadorConsoleMockup() {
  return (
    <MockupWindow urlLabel="app.rematar.com/remates" noPadding>
      <img
        src="/screenshots/panel-rematador.png"
        alt="Panel del rematador: Mis remates, con estado y lotes de cada evento"
        loading="lazy"
        className="aspect-[16/10] w-full object-cover object-top"
      />
    </MockupWindow>
  );
}
