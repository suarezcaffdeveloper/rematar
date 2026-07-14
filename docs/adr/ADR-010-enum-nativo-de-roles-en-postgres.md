# ADR-010: Enum nativo de PostgreSQL para el rol de usuario

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

Todo usuario tiene exactamente un rol (RF-02): `admin`, `rematador` o `comprador` (ver
[02-roles-y-casos-de-uso.md](../02-roles-y-casos-de-uso.md)). Ese rol es la base de todo el
control de acceso (RBAC) del sistema: qué endpoints puede llamar cada usuario. Hay que
decidir cómo se representa a nivel de base de datos.

## Decisión

El rol se modela como un `Enum` de Python (`UserRole`) mapeado a un **tipo `ENUM` nativo de
PostgreSQL** vía SQLAlchemy (`sa.Enum(UserRole, name="user_role")`), no como una columna de
texto libre.

## Alternativas consideradas

- **Columna `VARCHAR` con `CHECK constraint`**: PostgreSQL valida igual los valores
  permitidos, y agregar un rol nuevo es una migración más simple (solo tocar el check, sin
  las particularidades de `ALTER TYPE`). Es una alternativa razonable y se documenta acá
  para que quede explícito por qué no se eligió: un `ENUM` nativo deja la intención más
  explícita en el esquema (cualquiera que inspeccione la base ve los valores válidos sin
  buscar el constraint), y el tipo de columna generado por SQLAlchemy es más estricto a
  nivel de driver (rechaza valores inválidos antes de tocar la base en algunos casos).
- **Columna de texto libre sin restricción a nivel de base**, validando el valor solo en
  Pydantic/aplicación: se descarta porque delega una invariante de negocio importante
  (RF-02: "todo usuario tiene exactamente uno de estos tres roles") completamente a la capa
  de aplicación, sin protección si en el futuro algo escribe a la tabla por otra vía
  (un script, una migración de datos manual). Va contra RNF-11 en espíritu (no confiar
  únicamente en la capa de aplicación para una invariante que la base puede garantizar).
- **Tabla `roles` separada con relación many-to-many** (`user_roles`): sobre-ingeniería
  para el alcance actual, donde un usuario tiene exactamente un rol fijo, no combinaciones.
  Si en el futuro (ver roadmap: rol "Moderador") el modelo de permisos se vuelve más
  granular (permisos compuestos, no roles fijos), esto se reevalúa como una decisión nueva.

## Consecuencias

- **Ventajas**: la base de datos garantiza la invariante "el rol es uno de estos tres
  valores" independientemente de qué capa de aplicación escriba en la tabla; el esquema es
  auto-documentado.
- **Desventaja aceptada**: agregar un rol nuevo (por ejemplo, el "Moderador" del roadmap)
  no es un `autogenerate` limpio de Alembic — requiere una migración manual con
  `ALTER TYPE user_role ADD VALUE 'moderador'` (soportado dentro de una transacción desde
  PostgreSQL 12). Se acepta este costo porque los roles cambian con muy poca frecuencia
  (es una decisión de producto, no un dato de negocio que rote), y el beneficio de
  integridad a nivel de base pesa más que la incomodidad ocasional de esa migración manual.
- Cuando el roadmap agregue el rol "Moderador", esa migración manual debe documentarse en
  el mensaje de la migración de Alembic correspondiente, no solo en el código.
