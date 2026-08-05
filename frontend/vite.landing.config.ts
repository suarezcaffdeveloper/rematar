import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Config de build separada para el deploy de "solo landing" en Vercel (Root
 * Directory=frontend, Build Command=`npm run build:landing`,
 * Output Directory=`dist-landing`). Entry point único: `landing.html` ->
 * `src/landing-main.tsx` (ver ese archivo para el porqué de la separación de
 * `App.tsx`/`router.tsx`). No comparte `dist/` con el build normal (`npm run build`)
 * para no pisarlo si algún día ambos corren en el mismo pipeline.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-landing',
    rollupOptions: {
      input: resolve(__dirname, 'landing.html'),
    },
  },
});
