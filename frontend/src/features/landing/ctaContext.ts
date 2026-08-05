import { createContext, useContext } from 'react';

/**
 * Destino de los botones "Iniciar sesión" de la landing (navbar, hero, CTA final).
 * Por defecto apuntan a `/login` (comportamiento normal dentro de la SPA completa,
 * ver `RequireAuth.tsx`). El entry point standalone (`src/landing-main.tsx`, deploy
 * de solo-landing en Vercel) los reemplaza por un contacto externo vía
 * `LandingCtaContext.Provider`, para no ofrecer un login que no existe en ese build.
 */
export interface LandingCta {
  href: string;
  label: string;
  external: boolean;
}

const DEFAULT_CTA: LandingCta = { href: '/login', label: 'Iniciar sesión', external: false };

export const LandingCtaContext = createContext<LandingCta>(DEFAULT_CTA);

export function useLandingCta(): LandingCta {
  return useContext(LandingCtaContext);
}
