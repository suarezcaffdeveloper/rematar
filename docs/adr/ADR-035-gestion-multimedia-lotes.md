# ADR-035: Gestión multimedia de lotes — endpoint nuevo de subida a disco local, galería "viva" con PATCH inmediato por acción, y por qué no en modo creación

- **Fecha**: 2026-07-30
- **Estado**: Aceptada

## Contexto

Épica 6, Módulo 6.1 pide un sistema profesional de gestión multimedia para lotes: subida
de múltiples imágenes con barra de progreso y validación de formato/tamaño, selección de
imagen principal, reordenamiento por drag & drop, eliminación con confirmación, vista
previa antes de guardar, y estados vacíos/de carga -- todo con componentes reutilizables
y preparado para agregar video/PDF/certificados sanitarios a futuro sin rediseñar.
Restricciones explícitas: usar endpoints existentes, y si falta alguno indispensable,
documentarlo antes de implementarlo.

Investigación previa a implementar (ver también `docs/32-gestion-multimedia-lotes.md`):
`Lote.images` es JSONB (`{url, order, caption}`, `url` validado como `HttpUrl`), sin
ninguna columna ni tabla de almacenamiento de archivos propia -- mismo alcance que
`Remate.cover_image_url` (`docs/15-modulo-lote.md`). El backend no tenía, hasta este
módulo, **ninguna** capacidad de subida binaria: sin `UploadFile`, sin mount de archivos
estáticos, sin credenciales de storage externo en `config.py`. El `PATCH .../lotes/{id}`
ya existente sí acepta reemplazar el array `images` completo (`LoteUpdate.images:
list[LoteImage] | None`). Esto significa que **reordenar/eliminar/marcar principal** no
necesitaban ningún cambio de backend -- pero "subir un archivo" (con progreso y
validación real de formato/tamaño) sí, porque no existía ningún punto de entrada para
recibir bytes binarios. Se presentó esta brecha al usuario antes de escribir código; se
eligió explícitamente la opción "endpoint nuevo + disco local" (ver Decisión A) sobre
mantener todo basado en URLs de texto o integrar un storage externo (S3/Cloudinary).

## Decisión

### A. Endpoint nuevo y mínimo de subida, a disco local -- no storage externo

`POST /remates/{remate_id}/lotes/{lote_id}/images` (multipart, campo `file`) es el único
endpoint nuevo de este módulo. Valida `Content-Type` (`image/jpeg`, `image/png`,
`image/webp`) y tamaño (5 MB, `MAX_IMAGE_UPLOAD_BYTES`), guarda el archivo en
`MEDIA_ROOT/lotes/{lote_id}/{uuid}.ext` (disco local, dentro del volumen que
`docker-compose.yml` ya monta -- `./backend:/app` -- así que persiste entre reinicios del
contenedor sin ningún volumen adicional) y lo sirve vía `StaticFiles` montado en
`app/main.py` bajo `/static`. Devuelve únicamente `{"url": "..."}`; **no** toca la fila
del lote -- ver Decisión B.

Se descartó S3/Cloudinary (ver "Alternativas") por requerir credenciales externas y una
dependencia de Python nueva para un proyecto de portfolio que hoy no tiene ninguna cuenta
de nube configurada; se descartó quedarse solo con URLs de texto porque el enunciado pide
explícitamente "subida", "barra de progreso" e "indicador de carga durante la subida" --
ninguna de esas tres tiene sentido si no hay, en algún punto, un archivo real viajando al
servidor.

Mismos chequeos de permisos y de estructura editable que `create`/`update`/`soft_delete`
de Lote (`LoteService._get_owned_lote_or_raise` + `_assert_structure_editable`): solo el
rematador dueño puede subir, y solo mientras el remate está `draft`/`scheduled`.

### B. Subir un archivo y persistir el array `images` son dos pasos separados

El endpoint de subida no escribe en la base de datos. Quien orquesta la persistencia es
el frontend: `LoteGalleryManager` sube el archivo (`uploadLoteImageRequest`), recibe la
URL, arma el array `images` completo (con esa URL agregada, `order` recalculado
secuencialmente) y lo persiste con `updateLoteImagesRequest` -- una llamada distinta al
`PATCH .../lotes/{id}` que ya existía desde la Épica 2.2, sin necesidad de mandar el
resto de los campos del lote (acepta parciales).

Se decidió así, en vez de que el propio endpoint de subida actualizara `lote.images`
directamente en la misma transacción, por dos motivos: (1) mantiene el endpoint de
subida con una única responsabilidad (validar y guardar bytes, devolver una URL) sin que
tenga que conocer el concepto de "reemplazar el array completo" ni resolver condiciones
de carrera si dos subidas llegaran en paralelo al mismo lote; y (2) permite que el
frontend suba **varios archivos en paralelo** (mejor experiencia que subirlos de a uno)
y arme un **único** `PATCH` final con todas las URLs nuevas juntas, evitando que dos
`PATCH` concurrentes (uno por archivo) se pisen entre sí y alguno de los dos termine
perdiendo la entrada del otro (`last write wins` sobre el mismo array). El resto de las
acciones de la galería (eliminar, reordenar, marcar principal) son mutaciones puramente
locales del array ya conocido -- no necesitan ningún archivo nuevo, solo un `PATCH` con
el array recalculado.

**Trade-off aceptado**: si el usuario cierra el modal o pierde conexión entre que un
archivo terminó de subirse y el `PATCH` que lo persiste, ese archivo queda huérfano en
disco (subido, pero nunca referenciado desde ningún lote) -- mismo criterio ya aceptado
en ADR-034 para la duplicación de remates ("no hay rollback automático"). No se limpia
automáticamente en esta fase.

### C. La galería es "viva": cada acción persiste de inmediato, no hay un botón "Guardar" propio

Subir, eliminar, reordenar (por drag & drop o por las flechas ‹ ›) y marcar principal
disparan su propio `PATCH` apenas el usuario actúa -- actualización optimista (el estado
local cambia primero) con reversión y aviso por toast si el pedido falla, exactamente el
mismo patrón que ya usa el reordenamiento de lotes de la Épica 5.3 (ADR-034, sección C).
Se descartó "juntar" los cambios de la galería en el mismo botón "Guardar cambios" del
resto del formulario del lote: eso hubiera exigido mantener un estado "borrador" de
imágenes separado del array real (con sus propios object URLs sin subir todavía) y
reconciliarlo recién al hacer submit, mucho más estado y más superficie de bugs para un
beneficio dudoso -- ninguna otra pantalla de este proyecto (el reordenamiento de lotes,
las acciones del panel de control de la Épica 5.2) difiere sus efectos a un botón
"Guardar" tampoco.

### D. Reordenamiento: HTML5 Drag and Drop nativo + flechas ‹ › como fallback obligatorio

Mismo criterio ya establecido para el reordenamiento de lotes (ADR-034, sección C): sin
librería nueva, arrastrar-y-soltar nativo del navegador para el mouse, más un fallback
**siempre visible y funcional** (no oculto detrás de un menú) con flechas ‹ › bajo cada
miniatura, porque HTML5 Drag and Drop no funciona en absoluto en pantallas táctiles.
"Marcar como principal", a diferencia de reordenar, no necesita ningún fallback: es un
simple tap/click sobre la miniatura, gesto nativamente soportado en touch.

### E. La galería no está disponible en modo creación de un lote

Subir una imagen requiere un `lote_id` real (`POST .../lotes/{lote_id}/images`) que
todavía no existe mientras se está completando el formulario de "Crear lote". Se evaluó
hacer que el modal, al crear el lote exitosamente, permaneciera abierto internamente en
modo edición para habilitar la galería sin un segundo clic -- se descartó por alterar el
comportamiento ya probado y estable de la Épica 5.3 (hoy, crear cierra el modal
inmediatamente) a cambio de un ahorro marginal de un clic. En su lugar, el modal muestra
el texto "Guardá el lote para poder agregarle imágenes." mientras no hay un `lote`
persistido, y la galería completa aparece apenas se reabre en modo "Editar" -- ya
disponible de inmediato después de crear, sin ningún paso adicional del lado del backend.

## Preparación para video/PDF/certificados/archivos técnicos (sin rediseñar)

`Lote.documents` (JSONB, `{url, title, document_type}`) ya existe en el modelo desde la
Épica 2.2 (`docs/15-modulo-lote.md`), sin consumidor todavía. El mismo patrón de este
módulo -- endpoint de subida agnóstico del tipo de archivo (hoy valida solo imágenes,
`ALLOWED_IMAGE_CONTENT_TYPES`) + `PATCH` existente para persistir el array -- se extiende
a documentos con el mismo mecanismo: un `POST .../lotes/{id}/documents` análogo (nueva
lista blanca de Content-Types, ej. `application/pdf`), y un `LoteDocumentManager` que
reutilizaría `Dropzone`/`ProgressBar` (genéricos, sin ningún conocimiento de imágenes)
tal cual. Ningún componente de este módulo asume "imagen" salvo donde es explícito
(`validateImageFile`, la vista previa `<img>`) -- `Dropzone`, `ProgressBar` y el patrón
subir-then-PATCH son reutilizables sin cambios.

## Alternativas consideradas

- **Storage externo (S3/Cloudinary)**: descartado para esta fase -- requiere
  credenciales que el proyecto no tiene configuradas y una dependencia de Python nueva;
  más escalable a futuro, pero desproporcionado para un proyecto de portfolio que ya
  persiste `backend/` completo en un volumen de Docker. Si el volumen de imágenes creciera
  lo suficiente, migrar a un storage externo no requeriría cambiar `LoteImage` ni el
  `PATCH` existente -- solo `media_storage.save_lote_image` y el mount de `main.py`.
- **Quedarse solo con URLs de texto (sin subida real)**: descartado -- no cumple
  "subida de múltiples imágenes", "indicador de carga durante la subida" ni "validación
  de formato/tamaño de archivo" del enunciado, todos referidos a un archivo real, no a
  pegar un link ya hosteado en otro lado.
- **El propio endpoint de subida actualiza `lote.images` en la misma transacción**:
  descartado -- ver Decisión B: acopla una responsabilidad simple (guardar bytes) a la
  lógica de "reemplazar un array JSONB completo", y una subida en paralelo de varios
  archivos terminaría generando un `PATCH` por archivo con riesgo real de pisarse entre
  sí.
- **Diferir los cambios de la galería al botón "Guardar cambios" general del formulario
  del lote**: descartado -- ver Decisión C, más estado y más superficie de bugs sin
  precedente en ninguna otra pantalla de este proyecto.
- **Habilitar la galería durante la creación del lote** (dejando el modal abierto
  internamente en modo edición tras crear): descartado -- ver Decisión E, altera el
  comportamiento ya estable de la Épica 5.3 a cambio de un ahorro marginal.

## Consecuencias

- **Ventajas**: un único endpoint nuevo, mínimo y de responsabilidad acotada; cero
  cambios en `LoteImage`, en el `PATCH` existente, ni en ningún otro endpoint; galería
  reactiva sin un botón "Guardar" propio, consistente con el resto del proyecto;
  `Dropzone`/`ProgressBar` genéricos y reutilizables por documentos/video a futuro sin
  ningún cambio.
- **Desventajas aceptadas**: posibles archivos huérfanos en disco si una subida se
  completa pero el `PATCH` posterior falla o nunca llega (sin limpieza automática en esta
  fase, mismo criterio que ADR-034); la galería no está disponible mientras se crea un
  lote nuevo (un paso adicional -- "Editar" -- para empezar a cargarle imágenes); sin
  storage externo, el volumen de imágenes vive y escala con el disco del propio
  contenedor/host, no con un servicio de almacenamiento dedicado.
- El día que se agregue subida de video/PDF/certificados, el mismo patrón (endpoint de
  subida por tipo + `PATCH` existente para persistir el array correspondiente) aplica sin
  rediseñar nada de lo construido acá.
