# RematAR — Documentación de Arquitectura

## Qué es esto

RematAR es una plataforma web de remates en vivo. Distintos rematadores operan remates
independientes y simultáneos; los compradores se conectan a cualquier remate, ven la
transmisión y ofertan en tiempo real. El sistema determina el ganador de cada lote de
forma automática y auditable.

Este NO es un CRUD de práctica. El valor de portfolio del proyecto está en cómo resuelve
concurrencia, tiempo real y escalabilidad — no en la cantidad de pantallas.

## Estado actual

**Épica 5, Módulo 5.3 — Gestión completa de Remates y Lotes.** La Consola Operativa
(Épica 5.2) ya cubría un remate en vivo; este módulo agrega la pantalla donde el
rematador lo prepara antes de que empiece: crear/editar/eliminar/duplicar/publicar/
cancelar un remate, y crear/editar/eliminar/duplicar/reordenar (drag & drop nativo +
botones ↑/↓ como fallback siempre disponible) sus lotes, todo con tarjetas, sidebar y
modales -- sin tablas tradicionales. "Programar" y "Publicar" se consolidaron en una
sola acción (el motor de estados solo tiene una transición para eso); "duplicar" se
compone en el cliente con GET + POST porque el backend no expone ningún endpoint para
eso. Ver [31-gestion-remates-lotes.md](31-gestion-remates-lotes.md). `admin` sigue
viendo el placeholder de la Módulo 4.1; chat, streaming y notificaciones siguen siendo
módulos futuros. Esta carpeta sigue siendo la fuente de verdad del proyecto: cada fase
nueva debe leerla antes de proponer cambios y actualizarla si algo deja de ser cierto.
Ver el [README raíz](../README.md) para instrucciones de instalación y el estado exacto
del código.

## Índice

| Documento | Contenido |
|---|---|
| [01-vision-general.md](01-vision-general.md) | Descripción del proyecto, objetivos funcionales y técnicos |
| [02-roles-y-casos-de-uso.md](02-roles-y-casos-de-uso.md) | Roles del sistema y casos de uso |
| [03-requisitos-funcionales.md](03-requisitos-funcionales.md) | Requisitos funcionales (RF) |
| [04-requisitos-no-funcionales.md](04-requisitos-no-funcionales.md) | Rendimiento, escalabilidad, seguridad, consistencia, etc. |
| [05-flujo-de-negocio.md](05-flujo-de-negocio.md) | Flujo completo de negocio, de creación de remate a cierre |
| [06-eventos-del-sistema.md](06-eventos-del-sistema.md) | Catálogo de eventos de dominio |
| [07-maquinas-de-estado.md](07-maquinas-de-estado.md) | Estados de Remate, Lote y Oferta |
| [08-riesgos-tecnicos.md](08-riesgos-tecnicos.md) | Riesgos técnicos identificados y mitigaciones |
| [09-arquitectura-y-decisiones.md](09-arquitectura-y-decisiones.md) | Arquitectura general y enlace a los ADR |
| [10-diagramas.md](10-diagramas.md) | Diagrama de módulos y diagrama de flujo principal |
| [11-glosario.md](11-glosario.md) | Glosario de términos |
| [12-stack-tecnologico.md](12-stack-tecnologico.md) | Justificación de cada tecnología elegida |
| [13-mvp-y-roadmap.md](13-mvp-y-roadmap.md) | Alcance del MVP y roadmap futuro |
| [14-modulo-remate.md](14-modulo-remate.md) | Diseño de la entidad Remate: campos, estados implementados, permisos (Épica 2.1) |
| [15-modulo-lote.md](15-modulo-lote.md) | Diseño de la entidad Lote: campos, estados, permisos, reordenamiento (Épica 2.2) |
| [16-motor-de-estados.md](16-motor-de-estados.md) | Motor de estados de Remate y Lote: transiciones, reglas de negocio, finalización automática (Épica 2.3) |
| [17-auction-engine.md](17-auction-engine.md) | Auction Engine: entidad Oferta, funcionamiento interno, diagrama de flujo, preparación para Redis/WebSockets (Épica 2.4) |
| [18-integracion-redis.md](18-integracion-redis.md) | Integración de Redis: cliente compartido, health check, capas de cache/pub-sub/streams/locks (Épica 3.1) |
| [19-arquitectura-de-eventos.md](19-arquitectura-de-eventos.md) | Arquitectura de eventos: catálogo, Event Bus, flujo de publicación, preparación para WebSockets (Épica 3.2) |
| [20-gateway-websocket.md](20-gateway-websocket.md) | Gateway WebSocket: ciclo de vida de conexión, autenticación, heartbeat, `ConnectionManager` (Épica 3.3) |
| [21-sistema-de-salas.md](21-sistema-de-salas.md) | Sistema de salas: `RoomManager`, ciclo de vida de una sala, múltiples conexiones por usuario, preparación para el Event Bus (Épica 3.4) |
| [22-sincronizacion-tiempo-real.md](22-sincronizacion-tiempo-real.md) | Sincronización en tiempo real: Event Consumer, Dispatcher, flujo completo oferta→cliente, preparación para Chat/Notificaciones/Presencia (Épica 3.5) |
| [23-snapshot-service.md](23-snapshot-service.md) | Snapshot Service: reconstrucción de estado, reutilizable por transporte, por qué hace falta snapshot + eventos (Épica 3.6) |
| [24-fundacion-frontend.md](24-fundacion-frontend.md) | Fundación del frontend: estructura de carpetas, ruteo, layouts, cliente HTTP, guards, flujo de autenticación (Épica 4.1) |
| [25-dashboard-comprador.md](25-dashboard-comprador.md) | Dashboard del comprador: flujo de datos, consumo de la API existente, componentes reutilizables, limitaciones conocidas (Épica 4.3) |
| [26-detalle-remate.md](26-detalle-remate.md) | Página de detalle del remate: flujo de datos, listado de lotes, componentes reutilizables, preparación para la sala en vivo (Épica 4.4) |
| [27-sala-del-remate.md](27-sala-del-remate.md) | Sala del remate (versión inicial): flujo Snapshot → Render, estructura de componentes, optimización de renderizado, preparación para WebSockets (Épica 4.5) |
| [28-websocket-tiempo-real-sala.md](28-websocket-tiempo-real-sala.md) | Integración WebSocket y tiempo real: servicio WebSocket reutilizable, flujo Snapshot → WebSocket → Eventos, manejo de los 12 eventos de dominio, preparación para Chat/Presencia/Notificaciones/Streaming (Épica 4.6) |
| [29-dashboard-rematador.md](29-dashboard-rematador.md) | Dashboard del Rematador: flujo de datos, componentes reutilizables, acciones de ciclo de vida (iniciar/reanudar/finalizar), preparación para la Consola Operativa del Rematador (Épica 5.1) |
| [30-consola-operativa-rematador.md](30-consola-operativa-rematador.md) | Consola Operativa del Rematador: diagrama, flujo de cada acción, integración con WebSockets (reutilización de `useLiveRemateState`), preparación para la gestión completa de remates y lotes (Épica 5.2) |
| [31-gestion-remates-lotes.md](31-gestion-remates-lotes.md) | Gestión completa de Remates y Lotes: flujo de creación/edición, drag & drop de reordenamiento, componentes reutilizables (Épica 5.3) |
| [adr/](adr/) | Registro de decisiones de arquitectura (ADR), una por decisión relevante |

## Reglas de esta documentación (aplican a todas las fases futuras)

1. Ningún código se escribe sin que el diseño correspondiente esté documentado acá primero.
2. Toda decisión con ventajas/desventajas se registra como ADR en `adr/`, incluyendo las
   alternativas descartadas y por qué.
3. Los ADR no se editan retroactivamente. Si una decisión cambia, se crea un ADR nuevo que
   **supersede** al anterior, y ambos quedan enlazados entre sí.
4. Las secciones marcadas como "fuera de alcance del MVP" no se implementan hasta que el
   roadmap ([13-mvp-y-roadmap.md](13-mvp-y-roadmap.md)) lo indique explícitamente.
5. Si una fase futura descubre que algo de esta documentación ya no es cierto (por ejemplo,
   un estado que en la práctica necesitó dividirse), se corrige acá antes de seguir.

## Trazabilidad con el pedido original

| # | Pedido | Dónde está |
|---|---|---|
| 1 | Descripción completa del proyecto | 01 |
| 2 | Objetivos funcionales | 01 |
| 3 | Objetivos técnicos | 01 |
| 4 | Casos de uso | 02 |
| 5 | Requisitos funcionales | 03 |
| 6 | Requisitos no funcionales | 04 |
| 7 | Roles del sistema | 02 |
| 8 | Flujo completo de negocio | 05 |
| 9 | Eventos importantes del sistema | 06 |
| 10 | Estados de un remate | 07 |
| 11 | Estados de un lote | 07 |
| 12 | Estados de una oferta | 07 |
| 13 | Riesgos técnicos | 08 |
| 14 | Decisiones de arquitectura | 09 + `adr/` |
| 15 | Justificación de tecnologías | 12 |
| 16 | Funcionalidades del MVP | 13 |
| 17 | Funcionalidades futuras (roadmap) | 13 |
| 18 | Diagrama de módulos | 10 |
| 19 | Diagrama del flujo principal | 10 |
| 20 | Glosario | 11 |

## Historial de fases

- **Fase 0** (2026-07-13): Diseño completo del sistema — este set de documentos.
- **Fase 1** (2026-07-13): Base técnica del backend — config, logging, DB, Alembic,
  auth JWT, usuarios y roles, Docker. ADR-010 y ADR-011.
- **Épica 2, Módulo 2.1** (2026-07-13): Modelo de Remate — CRUD, permisos, ciclo de vida
  (sin Lotes todavía). Ver [14-modulo-remate.md](14-modulo-remate.md), ADR-012 y ADR-013.
- **Épica 2, Módulo 2.2** (2026-07-14): Modelo de Lote — CRUD completo, permisos,
  reordenamiento, sin lógica de subasta (no abre/cierra lotes, no hay ofertas). Ver
  [15-modulo-lote.md](15-modulo-lote.md), ADR-014 a ADR-017.
- **Épica 2, Módulo 2.3** (2026-07-14): Motor de Estados — iniciar/pausar/reanudar/
  finalizar un remate; abrir/cerrar/cancelar un lote y pasar al siguiente; finalización
  automática (RF-10); todavía sin ofertas, WebSockets ni tiempo real. Ver
  [16-motor-de-estados.md](16-motor-de-estados.md), ADR-018 y ADR-019.
- **Épica 2.4** (2026-07-15): Auction Engine — entidad `Oferta`, recepción/validación/
  aceptación/rechazo de ofertas con concurrencia segura (lock de fila, ADR-004),
  idempotencia, historial inmutable; todavía por HTTP, sin WebSockets ni Redis. Ver
  [17-auction-engine.md](17-auction-engine.md), ADR-020.
- **Épica 3, Módulo 3.1** (2026-07-16): Integración de Redis — cliente compartido vía
  `lifespan`, health check, capas de cache/pub-sub/streams/locks preparadas y probadas,
  sin ningún consumidor de dominio todavía. Ver
  [18-integracion-redis.md](18-integracion-redis.md), ADR-021.
- **Épica 3, Módulo 3.2** (2026-07-17): Arquitectura de Eventos — catálogo de eventos
  tipados (Pydantic), Event Bus interno (`Protocol`) sobre Redis Pub/Sub, un canal por
  remate, `RemateService`/`LoteService`/`AuctionEngine` publican sin conocer
  consumidores; todavía sin ningún consumidor real. Ver
  [19-arquitectura-de-eventos.md](19-arquitectura-de-eventos.md), ADR-022.
- **Épica 3, Módulo 3.3** (2026-07-18): Gateway WebSocket — endpoint `/api/v1/ws`,
  autenticación con el JWT existente en el primer mensaje (ADR-006, implementada por
  primera vez), heartbeat aplicativo (ping/pong de mensaje), `ConnectionManager` en
  memoria por instancia; todavía sin salas ni broadcast de eventos de dominio a
  clientes conectados. Ver
  [20-gateway-websocket.md](20-gateway-websocket.md), ADR-023.
- **Épica 3, Módulo 3.4** (2026-07-19): Sistema de Salas — `RoomManager` en memoria,
  agrupa conexiones por remate (`join_room`/`leave_room`), una sala por conexión,
  eliminación automática de salas vacías; todavía sin broadcast de eventos de dominio a
  las salas. Ver [21-sistema-de-salas.md](21-sistema-de-salas.md), ADR-024.
- **Épica 3, Módulo 3.5** (2026-07-20): Sincronización de eventos en tiempo real —
  `EventConsumer` (`app/realtime/`) escucha Redis Pub/Sub por patrón, interpreta cada
  evento contra una whitelist explícita, y lo entrega únicamente a las conexiones de la
  sala del remate correspondiente; cero cambios en el dominio, el Auction Engine, el
  Gateway, el Room Manager o el Event Bus. Ver
  [22-sincronizacion-tiempo-real.md](22-sincronizacion-tiempo-real.md), ADR-025.
- **Épica 3, Módulo 3.6** (2026-07-21): Snapshot Service — `app/snapshot/` reconstruye
  el estado completo de un remate (info, lote activo, oferta ganadora, historial
  reciente, conectados) para un cliente que entra a mitad de un remate en vivo (RF-16,
  ADR-008 implementado por primera vez); reutilizable por HTTP y WebSocket; el Gateway
  lo usa únicamente al entrar a una sala; cero cambios en el dominio, el Auction
  Engine, el Event Bus, Redis, el Gateway (salvo el punto de integración), el Room
  Manager o el Event Consumer. Ver [23-snapshot-service.md](23-snapshot-service.md),
  ADR-026.
- **Épica 4, Módulo 4.1** (2026-07-22): Fundación del Frontend — React + Vite +
  TypeScript, estructura por dominio (`features/`/`shared/`/`app/`), React Router con
  guards de autenticación y de rol anidados, cliente Axios centralizado con JWT
  automático y refresh transparente (cola single-flight), Zustand para estado
  compartido, Tailwind v4, componentes base; cero cambios en el backend. Ver
  [24-fundacion-frontend.md](24-fundacion-frontend.md), ADR-027.
- **Épica 4, Módulo 4.3** (2026-07-23): Dashboard del Comprador — primera pantalla de
  producto real: listado de remates visibles para un `comprador`, en tarjetas
  responsive, con búsqueda por título (client-side, el backend no expone búsqueda de
  texto), filtro por estado/categoría, orden (próximos/recientes/en vivo), estados de
  carga/vacío/error; sin sala del remate, WebSockets, ofertas, chat ni video (módulos
  futuros); cero cambios en el backend ni en la autenticación. Ver
  [25-dashboard-comprador.md](25-dashboard-comprador.md), ADR-028.
- **Épica 4, Módulo 4.4** (2026-07-24): Página de Detalle del Remate — toda la
  información de un remate puntual (portada, estado, fecha, categoría, descripción,
  ubicación, rematador, cantidad de lotes) más el listado completo de sus lotes, en
  tarjetas; breadcrumb de navegación; botón "Entrar al remate" a un placeholder de la
  sala en vivo, ahora en su propia ruta (`/remates/:remateId/sala`); dos fuentes de
  datos con carga/error independientes (remate y lotes); sin WebSockets, ofertas, chat,
  video ni tiempo real (módulos futuros); cero cambios en el backend ni en la
  autenticación. Ver [26-detalle-remate.md](26-detalle-remate.md), ADR-029.
- **Épica 4, Módulo 4.5** (2026-07-25): Sala del Remate (versión inicial) — pantalla
  principal de un remate en vivo resuelta enteramente con el Snapshot Service ya
  existente (Épica 3.6), sin WebSockets todavía (pedido explícito); cabecera, lote
  activo (galería, ficha técnica, precio inicial, oferta actual, incremento mínimo),
  panel de ofertas (comprador líder anonimizado, historial reciente), próximos lotes no
  seleccionables, botón "Realizar oferta" deshabilitado; nuevo feature
  `features/sala/`, espejando el límite de módulo del `app/snapshot/` del backend;
  arquitectura preparada para WebSockets sin reestructurar (props tipadas, sin código
  simulado); cero cambios en el backend ni en la autenticación. Ver
  [27-sala-del-remate.md](27-sala-del-remate.md), ADR-030.
- **Épica 4, Módulo 4.6** (2026-07-26): Integración WebSocket y actualización en tiempo
  real — cliente WebSocket reutilizable (`shared/websocket/client.ts`): auth en el
  primer mensaje, heartbeat, reconexión con backoff exponencial, salas, cierre limpio;
  los 12 eventos de dominio ya sincronizados por el backend, aplicados de forma
  incremental sobre el snapshot en memoria (nunca se recarga la pantalla completa);
  snapshot recibido también por WebSocket tras `join_room`, que reconcilia
  automáticamente cualquier evento perdido en una reconexión; indicadores visuales de
  conexión; arquitectura preparada para Chat/Presencia/Notificaciones/Streaming sin
  modificar el servicio WebSocket; cero cambios en el backend ni en la autenticación. Ver
  [28-websocket-tiempo-real-sala.md](28-websocket-tiempo-real-sala.md), ADR-031.
- **Épica 5, Módulo 5.1** (2026-07-27): Dashboard del Rematador -- consola de tarjetas
  con los remates propios del rematador autenticado, en cualquier estado; indicadores
  operativos por tarjeta (lotes, conectados si disponible, lote activo/próximo);
  acciones de ciclo de vida (iniciar/reanudar/finalizar, motor de estados de la Épica
  2.3); buscador/filtro (incluido `draft`)/orden reusando la infraestructura del
  dashboard del comprador (Épica 4.3); fila de indicadores tipo consola, sin tablas;
  ruta placeholder para la Consola Operativa del Rematador (Módulo 5.2); cero cambios en
  el backend, la autenticación ni la Sala del Remate del comprador. Ver
  [29-dashboard-rematador.md](29-dashboard-rematador.md), ADR-032.
- **Épica 5, Módulo 5.2** (2026-07-28): Consola Operativa del Rematador -- pantalla de
  control de un remate en vivo: cabecera (estado, tiempo transcurrido, conectados,
  indicador de conexión), panel principal con el lote activo, panel de control con las
  seis acciones del motor de estados (abrir lote, pasar al siguiente, cerrar lote,
  pausar, reanudar, finalizar), panel de ofertas en tiempo real con la última oferta
  destacada, panel de próximos lotes seleccionable; reutiliza tal cual
  `useLiveRemateState`/`ImageGallery`/`ConnectionStatusBadge` de la Épica 4.6, sin
  modificarlos; reemplaza el placeholder de "Administrar" de la Épica 5.1 sin tocar el
  árbol de rutas; cero cambios en el backend, la autenticación ni `features/sala/`. Ver
  [30-consola-operativa-rematador.md](30-consola-operativa-rematador.md), ADR-033.
- **Épica 5, Módulo 5.3** (2026-07-29): Gestión completa de Remates y Lotes -- pantalla
  de preparación de un remate (`/remates/:remateId/lotes`, reemplaza el placeholder de la
  Épica 5.1): crear/editar/eliminar/duplicar/publicar/cancelar el remate desde una
  sidebar, y crear/editar/eliminar/duplicar/reordenar sus lotes en tarjetas; "programar"/
  "publicar" consolidados en una sola acción (una única transición de backend);
  "duplicar" compuesto en el cliente (GET + POST) porque no hay endpoint para eso;
  reordenamiento con HTML5 Drag and Drop nativo (actualización optimista con
  revert-on-error) y botones ↑/↓ como mecanismo siempre disponible, no cosmético; cinco
  componentes genéricos nuevos en `shared/components/` (`Modal`, `ConfirmModal`,
  `Textarea`, `Select`, `DropdownMenu`); reutiliza `useRemateDetail`/`useLotes` de la
  Épica 4.4 sin modificarlos; cero cambios en el backend ni en la autenticación. Ver
  [31-gestion-remates-lotes.md](31-gestion-remates-lotes.md), ADR-034.
