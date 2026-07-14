# RematAR — Documentación de Arquitectura

## Qué es esto

RematAR es una plataforma web de remates en vivo. Distintos rematadores operan remates
independientes y simultáneos; los compradores se conectan a cualquier remate, ven la
transmisión y ofertan en tiempo real. El sistema determina el ganador de cada lote de
forma automática y auditable.

Este NO es un CRUD de práctica. El valor de portfolio del proyecto está en cómo resuelve
concurrencia, tiempo real y escalabilidad — no en la cantidad de pantallas.

## Estado actual

**Épica 2, Módulo 2.2 — Modelo de Lote.** Fase 0 (diseño), Fase 1 (base técnica: auth,
usuarios, roles, Docker), el modelo de Remate (Módulo 2.1) y ahora el modelo de Lote
(CRUD, permisos, reordenamiento, sin lógica de subasta todavía) ya están implementados y
probados. Esta carpeta sigue siendo la fuente de verdad del proyecto: cada fase nueva debe
leerla antes de proponer cambios y actualizarla si algo deja de ser cierto. Ver el
[README raíz](../README.md) para instrucciones de instalación y el estado exacto del
código.

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
