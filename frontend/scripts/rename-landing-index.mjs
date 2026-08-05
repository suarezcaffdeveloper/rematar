// Vite emite el HTML de salida con el mismo nombre que el entry point
// (`landing.html`), pero Vercel sirve `/` buscando `index.html` en el directorio de
// salida. Este paso solo renombra ese archivo después del build; las referencias a
// JS/CSS con hash que contiene siguen siendo válidas porque son rutas absolutas
// (`/assets/...`), no dependen del nombre del HTML.
import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const outDir = resolve(import.meta.dirname, '..', 'dist-landing');

await rename(resolve(outDir, 'landing.html'), resolve(outDir, 'index.html'));
