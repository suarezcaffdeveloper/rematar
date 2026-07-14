# ADR-012: Configuración del remate como JSONB validado con Pydantic

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El remate necesita una "configuración general" (pedida explícitamente en el diseño de la
Épica 2, Módulo 2.1): al menos si tiene habilitado el anti-sniping y en cuántos segundos
extiende el cierre (ver [ADR-007](ADR-007-anti-sniping.md) de Fase 0, que ya preveía esto
como "parámetro configurable por remate"), y la moneda en la que se van a expresar los
montos de ese remate. Es razonable esperar que este conjunto de opciones crezca en fases
futuras (por ejemplo, un porcentaje de comisión, un incremento mínimo por defecto para
los lotes que todavía no existen) sin que cada campo nuevo sea, necesariamente, algo que
requiera búsquedas o filtros SQL eficientes por sí solo.

## Decisión

La configuración se modela como **una única columna `JSONB`** (`remates.settings`), con
un esquema Pydantic (`RemateSettings`) que la valida en el borde de la API — nunca se
guarda ni se lee un `dict` sin validar. El modelo ORM la tipa como `dict`; la validación
de forma y contenido ocurre exclusivamente en `app/modules/remates/schemas.py`.

## Alternativas consideradas

- **Columnas sueltas por cada opción** (`anti_sniping_enabled`, `anti_sniping_extension_seconds`,
  `currency`, cada una como columna de la tabla `remates`): más "querybale" a nivel SQL
  (se podría filtrar `WHERE anti_sniping_enabled = true` directamente), y con validación
  de tipos a nivel de base de datos. Se descarta como decisión general porque cada opción
  nueva de configuración requeriría una migración de esquema — y estas opciones son,
  precisamente, las que más se espera que crezcan a medida que se refinan las reglas de
  negocio de bidding en las próximas fases. Ninguna de las opciones actuales necesita
  filtrarse en una consulta SQL (no hay ningún caso de uso documentado de "listar remates
  con anti-sniping habilitado"), así que la ventaja de columnas sueltas no se aprovecha
  hoy.
- **Una tabla `remate_settings` separada (1 a 1 con `remates`)**: mismo argumento en
  contra que las columnas sueltas (cada opción nueva es una migración), con el costo
  adicional de un JOIN para leer algo que siempre se necesita junto con el remate. Se
  descarta por no aportar nada frente a JSONB para este caso de uso.

## Consecuencias

- **Ventajas**: agregar una opción de configuración nueva (ej. comisión, incremento
  mínimo por defecto) es un cambio en `RemateSettings` (Pydantic) sin migración de
  Alembic, siempre que no necesite ser indexable o consultable por SQL. Los remates ya
  creados con la forma vieja del JSON siguen siendo válidos mientras el campo nuevo tenga
  un valor por defecto en el schema.
- **Desventajas aceptadas**: no se puede filtrar ni indexar eficientemente por un campo
  dentro de `settings` sin un índice funcional específico de PostgreSQL sobre esa
  expresión JSONB. Si en el futuro aparece un caso de uso real de "buscar remates con tal
  configuración", esa opción puntual se promueve a columna propia en ese momento — no se
  decide de antemano cuál.
- Precedente para Lotes/Ofertas: si esos módulos necesitan configuración de forma libre y
  no consultable por SQL, este mismo patrón (JSONB + Pydantic en el borde) aplica
  directamente sin necesidad de un ADR nuevo, salvo que aparezca un caso de uso que
  contradiga los supuestos de este.
