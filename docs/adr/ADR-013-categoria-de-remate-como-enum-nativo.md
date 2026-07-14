# ADR-013: Categoría de remate como enum nativo de PostgreSQL

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El remate necesita una categoría (rubro) para que los compradores puedan descubrir y
filtrar remates — un campo explícitamente pedido en el diseño del Módulo 2.1. Igual que
con el rol de usuario en Fase 1 ([ADR-010](ADR-010-enum-nativo-de-roles-en-postgres.md)),
hay que decidir si es un conjunto fijo validado por la base, texto libre, o una tabla
aparte administrable.

## Decisión

Se usa el mismo patrón que ADR-010: un `Enum` de Python (`RemateCategory`) mapeado a un
**ENUM nativo de PostgreSQL** (`remate_category`), con un conjunto inicial de nueve
categorías pensado para el dominio de remates en Argentina (inmuebles, vehículos,
maquinaria agrícola, hacienda, arte y antigüedades, electrónica, mobiliario,
indumentaria, y una categoría `otros` como catch-all para lo que no encaje).

## Alternativas consideradas

- **Texto libre**: el rematador escribe cualquier string como categoría. Se descarta:
  sin restricción, la misma categoría termina escrita de formas distintas ("Hacienda",
  "hacienda", "Ganado") y cualquier filtro o agrupación por categoría se vuelve poco
  confiable — justo el caso de uso que motiva tener el campo.
- **Tabla `categories` separada, administrable por el admin** (con CRUD propio): es la
  opción más flexible a largo plazo (permite agregar/renombrar categorías sin una
  migración de esquema, y eventualmente jerarquías de categorías), pero es una
  funcionalidad en sí misma — un CRUD completo de administración de categorías — que
  nadie pidió todavía para este módulo. Se descarta **por ahora** como sobre-ingeniería;
  se deja anotada en el roadmap como la evolución natural si el catálogo de categorías
  necesita cambiar con frecuencia o ser gestionado sin un despliegue.
- **Enum de Python validado solo en Pydantic, columna de texto sin restricción en la
  base**: mismo argumento que en ADR-010 — delega una invariante de negocio a la capa de
  aplicación exclusivamente, sin protección si algo más escribe a la tabla.

## Consecuencias

- **Ventajas**: mismas que ADR-010 — la base garantiza el conjunto válido de categorías
  sin depender de que toda escritura pase por la capa de aplicación; consistente con el
  patrón ya establecido en el proyecto (un desarrollador que conoce ADR-010 reconoce
  inmediatamente este mismo patrón acá).
- **Desventaja aceptada**: agregar o renombrar una categoría requiere una migración
  manual (`ALTER TYPE remate_category ADD VALUE ...`), igual que con los roles. Se acepta
  porque, igual que los roles, se espera que el conjunto de categorías cambie con muy
  poca frecuencia comparado con la tasa de creación de remates.
- Si en una fase futura los propios rematadores necesitan crear categorías nuevas sin
  intervención de un desarrollador, este ADR queda superado por uno que introduzca la
  tabla `categories` administrable descartada arriba.
