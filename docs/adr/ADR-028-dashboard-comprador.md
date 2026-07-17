# ADR-028: Dashboard del Comprador — carga completa + filtrado client-side, N+1 acotado para lote count, sin nombre de rematador

- **Fecha**: 2026-07-23
- **Estado**: Aceptada

## Contexto

Épica 4, Módulo 4.3 pide la primera pantalla de producto real: el dashboard del
comprador, con búsqueda por título, filtro por estado y categoría, y orden (próximos,
recientes, en vivo). El enunciado prohíbe explícitamente tocar el backend — todo tiene
que resolverse consumiendo `GET /remates` y `GET /remates/{id}/lotes` tal como existen
hoy (ver [25-dashboard-comprador.md](../25-dashboard-comprador.md), "Contrato del
backend consumido"). Leyendo esos endpoints aparecen tres huecos que esta fase tiene que
decidir cómo resolver sin backend nuevo: no hay búsqueda de texto, no hay cantidad de
lotes en `RemateRead`, y no hay forma de resolver el dueño de un remate a su nombre.

## Decisión

### A. Cargar todos los remates visibles y filtrar/ordenar en el cliente, no paginar contra el servidor

`GET /remates` no acepta ningún parámetro de búsqueda de texto (confirmado en
`app/modules/remates/router.py`: solo `category`, `status`, `owner_id`). Paginar
server-side y filtrar solo la página visible por título daría resultados incompletos —
un remate que matchea la búsqueda pero está en la página 3 nunca aparecería. La única
forma de que "buscar por título" funcione de verdad, sin tocar el backend, es tener la
lista completa en el cliente. `useRemates` pagina internamente contra `GET /remates`
(100 por request) hasta juntar el `total` que el propio backend informa, con un tope
duro de 500 remates para no pedir sin límite. `filterAndSortRemates` (función pura,
`features/remates/filtering.ts`) filtra y ordena esa lista ya completa.

**Costo aceptado**: con más de 500 remates simultáneos visibles para un comprador, el
tope corta la lista antes de tenerla completa — un comprador podría no ver un remate
que exista. Es un límite conocido y documentado (ver "Trabajo futuro" en
25-dashboard-comprador.md), no una omisión: la solución correcta a ese volumen es
búsqueda de texto server-side, que requiere tocar el backend y está fuera de alcance de
este módulo. 500 es un margen muy amplio para el volumen esperado de un MVP.

### B. Cantidad de lotes: una request perezosa por tarjeta, no un cambio de schema

`RemateRead` no incluye `lote_count` (confirmado en
`app/modules/remates/schemas.py`). Agregarlo implicaría tocar el backend (query
agregada o campo calculado), prohibido en esta fase. La alternativa sin tocar el
backend es pedir `GET /remates/{id}/lotes?page_size=1` por remate y quedarse con
`total` del envelope de paginación — un N+1 deliberado. Se acota de dos formas: (1) es
perezoso por tarjeta (`useLoteCount`, un hook por `RemateCard` montada, no una carga
adelantada de todas), así que el costo real es "una request por tarjeta que el usuario
efectivamente ve en pantalla", no por remate en la base; (2) si la request falla, la
tarjeta muestra el resto de su información igual — no es un dato crítico. **No es una
optimización pendiente**: la solución correcta a largo plazo es que el backend exponga
`lote_count` en `RemateRead` (o en un endpoint de listado dedicado), documentado como
trabajo futuro.

### C. Sin nombre del rematador en la tarjeta

`RemateRead.owner_id` es un UUID. No existe `GET /users/{id}` y `GET /users` es
exclusivamente para `admin` (confirmado en `app/modules/users/router.py`) — un
comprador no tiene ninguna forma de resolver ese id a un nombre sin un endpoint nuevo,
prohibido en esta fase. Mostrar el UUID crudo en la tarjeta sería peor que no mostrar
nada (ruido sin significado para el usuario) — se omite el dato por completo. El
enunciado de este módulo ya anticipaba esta posibilidad ("rematador, si hace falta
mostrarlo"): la decisión es que no hace falta forzarlo con lo que el backend expone
hoy.

### D. Íconos SVG a mano, sin librería de íconos

El dashboard necesita un puñado fijo de íconos (calendario, ubicación, caja, lupa,
martillo). Se escriben a mano como componentes SVG (`features/remates/components/
icons.tsx`) en vez de agregar una dependencia (`lucide-react`, `heroicons`, etc.) —
mismo criterio ya sentado en ADR-027 de mantener el árbol de dependencias chico. El
costo es mantenerlos a mano si la paleta de íconos crece mucho; para media docena de
usos puntuales, la dependencia no se justifica.

### E. Portada por defecto: degradé + ícono, no una imagen estática

`cover_image_url` es opcional en `RemateRead`. En vez de servir un archivo de imagen
placeholder (que habría que alojar en algún lado y mantener) o dejar el espacio vacío,
la tarjeta renderiza un degradé de marca con el ícono de martillo cuando no hay
`cover_image_url` — cero assets nuevos, coherente con la paleta ya definida en
`styles/index.css`.

## Alternativas consideradas

- **Paginación infinita/"cargar más" contra el servidor, sin filtrar client-side**: más
  liviano en la carga inicial, pero rompe la búsqueda por título (sección A) — un
  comprador buscando algo que no está en la primera página no lo encontraría nunca.
  Descartado mientras el backend no exponga búsqueda de texto.
- **Pedir la cantidad de lotes de todos los remates de una sola vez, adelantado**: evita
  el N+1 por tarjeta a costa de pedir datos que el usuario puede no llegar a ver (si
  hay 40 remates cargados pero solo 6 visibles en el viewport inicial). Se prefiere el
  hook perezoso por tarjeta (sección B): el costo real queda atado a lo que
  efectivamente se renderiza.
- **Mostrar `owner_id` truncado como si fuera un nombre**: descartado de plano — un
  identificador técnico no es información útil para un comprador, y podría leerse como
  un bug en vez de una omisión deliberada.
- **Librería de íconos (`lucide-react`, `@heroicons/react`)**: descartada por el volumen
  bajo de íconos necesarios (sección D) — no vale la pena la dependencia todavía.

## Consecuencias

- **Ventajas**: búsqueda por título funciona de verdad (no solo dentro de una página);
  ninguna tarjeta muestra un dato que no puede respaldar (ni UUID crudo, ni una imagen
  rota); agregar un filtro/orden nuevo es una rama más en `filterAndSortRemates`, una
  función pura fácil de probar sin montar componentes.
- **Desventajas aceptadas**: la carga inicial del dashboard es más pesada de lo que
  sería con paginación real (hasta 5 requests de 100 remates cada una en el peor caso
  antes del tope); `useLoteCount` genera una request HTTP por tarjeta visible, no
  cacheada entre montajes/desmontajes de la misma tarjeta.
- El día que el backend exponga búsqueda de texto y/o `lote_count` en `RemateRead`, la
  migración es local a `features/remates/`: `useRemates` deja de paginar-y-acumular (le
  alcanza con pedir la página que corresponda) y `RemateCard` deja de necesitar
  `useLoteCount` — ningún otro módulo del frontend depende de esta forma de cargar los
  datos.
