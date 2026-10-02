import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../styles/index.css';
import './landing-v4.css';
import { LandingV4 } from './LandingV4';

/**
 * Entrada de desarrollo de la opción B de la landing: abrir `/landing-v4.html` con el dev server.
 * No toca `landing-main.tsx`, `App.tsx` ni el router (el `BrowserRouter` de acá existe solo
 * porque este entry corre fuera de la SPA).
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en landing-v4.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <LandingV4 />
    </BrowserRouter>
  </StrictMode>,
);
