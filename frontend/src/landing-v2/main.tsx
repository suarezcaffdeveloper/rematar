import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../styles/index.css';
import './landing-v2.css';
import { LandingV2 } from './LandingV2';

/**
 * Entrada de desarrollo del ejemplo de landing: abrir `/landing-v2.html` con el dev server.
 * No toca `landing-main.tsx`, `App.tsx` ni el router. Para integrarla de verdad alcanza con
 * reemplazar `LandingPage` por `LandingV2` (el `BrowserRouter` de acá solo existe porque este
 * entry corre fuera de la SPA; dentro de la app ya hay uno).
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en landing-v2.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <LandingV2 />
    </BrowserRouter>
  </StrictMode>,
);
