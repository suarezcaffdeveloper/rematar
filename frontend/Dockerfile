# Imagen única para desarrollo (ver docker-compose.yml en la raíz del proyecto) --
# mismo criterio que backend/Dockerfile: el volumen montado (./frontend:/app) permite
# hot module replacement de Vite sin reconstruir la imagen en cada cambio. Una imagen
# de producción real no montaría un volumen ni correría el dev server de Vite: haría
# `npm run build` una vez y serviría `dist/` con un servidor estático (nginx, o
# `vite preview` como mínimo). Ese Dockerfile de producción es un ítem de roadmap
# explícito (ver docs/13-mvp-y-roadmap.md), no algo que esta fase necesite resolver.
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Fase 10 de remediación del WebSocket Security Audit (SAST/semgrep): la imagen corría
# como root por default. `node:24-slim` ya trae un usuario "node" sin privilegios
# (uid 1000) -- el `chown` cubre también node_modules (instalado arriba como root) para
# que el volumen nombrado `frontend_node_modules` (ver docker-compose.yml) se inicialice
# con esos permisos.
RUN chown -R node:node /app
USER node

EXPOSE 5173

# --host 0.0.0.0: sin esto, Vite solo escucha en localhost DENTRO del contenedor y el
# puerto mapeado en docker-compose.yml nunca recibiría nada.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
