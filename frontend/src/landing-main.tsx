import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { LandingPage } from './features/landing/pages/LandingPage';
import { LandingCtaContext } from './features/landing/ctaContext';

/**
 * Entry point standalone para el deploy de "solo landing" en Vercel (ver
 * `vite.landing.config.ts` y `landing.html`). Monta únicamente `LandingPage`: nunca
 * importa `App.tsx`/`app/router.tsx`, así que el login, el registro, los dashboards y
 * el cliente de la API (`shared/api/client.ts`, que exige `VITE_API_BASE_URL`) quedan
 * completamente afuera de este bundle -- no hay forma de llegar a una pantalla que
 * dependa de un backend porque ese código ni siquiera se compila acá.
 *
 * Los botones "Iniciar sesión" de la landing pasan a apuntar a un contacto externo en
 * vez de `/login` (que no existe en este build), vía `LandingCtaContext`.
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en landing.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <LandingCtaContext.Provider
      value={{
        href: 'mailto:suarezz.santi01@gmail.com?subject=RematAR',
        label: 'Contactame',
        external: true,
      }}
    >
      <LandingPage />
    </LandingCtaContext.Provider>
  </StrictMode>,
);
