# ADR-027: Fundación del Frontend — estructura por dominio, Zustand, Tailwind, cliente HTTP con refresh transparente

- **Fecha**: 2026-07-22
- **Estado**: Aceptada

## Contexto

Hasta ahora RematAR era backend puro. Esta épica arranca el frontend (React + Vite,
decidido en Fase 0, ver [ADR de stack](../12-stack-tecnologico.md)) — pero antes de
construir una sola pantalla de producto (remates, lotes, sala del remate) hace falta
una base: estructura de carpetas, ruteo, layouts, un cliente HTTP que sepa manejar JWT
solo, y los primeros componentes reutilizables. Esta épica pide explícitamente
justificar dos decisiones con alternativa provista (CSS Modules vs. Tailwind, Context
API vs. Zustand) y prohíbe tocar el backend — todo lo que sigue asume esa restricción.

## Decisión

### A. React + Vite + TypeScript + React Router + Axios (sin alternativa a evaluar)

Ya decidido en Fase 0 (React + Vite, [12-stack-tecnologico.md](../12-stack-tecnologico.md))
o exigido por el enunciado de esta épica (TypeScript, React Router, Axios) — no hay
justificación que dar acá, son puntos de partida, no elecciones de este módulo.

### B. Estructura de carpetas por dominio, no por tipo de archivo

`src/features/<dominio>/` (hoy solo `auth`) agrupa todo lo de ese dominio (api, store,
types, hooks, pages) en una misma carpeta — en vez de `src/pages/`, `src/hooks/`,
`src/stores/` con todos los dominios mezclados adentro. `src/shared/` es lo
genuinamente transversal (cliente HTTP, componentes base, guards, config, toasts) y
`src/app/` es el ensamblaje de la aplicación (router, layouts, páginas que todavía no
pertenecen a ningún dominio de producto). Es, deliberadamente, el mismo criterio que ya
justifica `app/modules/<dominio>/` en el backend (ver
[README del backend](../../backend/README.md#por-qué-esta-organización-no-por-capa-técnica-por-módulo-de-dominio)):
con un solo feature (`auth`) la diferencia no se nota, pero es la base sobre la que
`features/remates/`, `features/lotes/`, `features/sala/` van a colgar sin reorganizar
nada existente.

### C. Tailwind CSS (v4), no CSS Modules

El enunciado pide justificar Tailwind si se lo elige por sobre CSS Modules (el default
implícito). Motivos concretos para este proyecto:

- **La interfaz va a estar dominada por estado que cambia solo** (una oferta que pasa a
  "superada", un lote que pasa de `pending` a `open`, un contador de conectados) — con
  CSS Modules, cada variante visual de un componente implica o bien una clase por
  estado en el `.module.css` (`.badge`, `.badgeWinning`, `.badgeOutbid`, ...) o lógica
  para combinarlas a mano. Con utilidades, la variante es una expresión en el mismo
  archivo del componente (`clsx(baseClasses, status === 'winning' && 'bg-success-50')`)
  — no hay dos archivos que mantener sincronizados por componente.
- **Consistencia de diseño sin un archivo de tokens aparte que alguien tiene que
  acordarse de importar**: la paleta (`--color-brand-*`, `--color-danger-*`,
  `--color-success-*`) vive en un único `@theme` (`src/styles/index.css`) y cualquier
  componente nuevo la usa por nombre de clase, sin importar nada.
- **Cero colisión de nombres de clase entre componentes** — la razón original de
  CSS Modules — la resuelve igual de bien Tailwind: no hay clases de autor en absoluto,
  solo utilidades.
- Tradeoff aceptado: JSX más verboso (clases largas en el `className`) — mitigado
  encapsulando cada patrón repetido en un componente base de `shared/components/`
  (`Button`, `Input`, `Card`, `Alert`) en vez de repetir utilidades por todos lados.

### D. Zustand, no Context API — pero sin descartar Context como herramienta

El enunciado pide justificar Zustand si se lo elige por sobre Context API. El motivo no
es esta épica (que solo tiene estado de sesión, de baja frecuencia) sino la que sigue:
el diferencial real de este proyecto es estado que va a cambiar **muy seguido** — ofertas
en vivo, estado de una sala, conteo de conectados (Épica 4 en adelante, sobre el Gateway
WebSocket y el Snapshot Service que el backend ya expone). `Context.Provider` notifica a
**todo** su subárbol en cada cambio de valor, sin selectores — para no pagar ese costo
hay que fragmentar en muchos contextos chicos y memoizar con cuidado. Zustand se
suscribe por selector desde el primer día
(`useAuthStore(useShallow((s) => ({...})))`, ver `features/auth/hooks.ts`): un
componente solo vuelve a renderizar si el campo que leyó cambió, sin im-portar cuántas
otras cosas cambien en el store. Adoptarlo ahora, para el store de sesión, deja
establecido el patrón que los stores de tiempo real van a seguir — evita migrar todo el
manejo de estado a mitad de proyecto cuando aparezca la primera pantalla con eventos de
WebSocket. Dicho esto, Context sigue siendo la herramienta correcta para lo que React
Router ya resuelve con ella internamente (el propio `RouterProvider`) — no se lo
descarta como concepto, solo no hace falta un Context de aplicación propio todavía.

### E. Dos instancias de Axios (`apiClient`/`rawClient`), no una

`shared/api/client.ts` expone `apiClient` (con interceptores: adjunta el token,
reintenta una vez ante 401) y `rawClient` (sin interceptores, usado únicamente por los
cuatro endpoints de sesión: login/register/refresh/logout). Es un diseño de
"cinturón y tirantes": el interceptor de respuesta YA excluye esos cuatro endpoints por
URL (`isSessionEndpoint`), así que en teoría alcanzaría con una sola instancia — pero
usar una instancia estructuralmente distinta para el refresh hace imposible, por
construcción, que un 401 de `/auth/refresh` dispare el propio interceptor de reintento
de `apiClient` (que llamaría a `refreshSession`, que llama a `/auth/refresh`... un loop
si alguna vez esa exclusión por URL tuviera un bug). El costo es una instancia de Axios
extra, prácticamente gratis.

### F. `shared/api/client.ts` no importa `features/auth/store.ts` — inversión de dependencias

Si `client.ts` importara `useAuthStore` directamente, y `features/auth/api.ts`
importara `apiClient`/`rawClient` de `client.ts`, y `features/auth/store.ts` importara
las funciones de `api.ts` para orquestarlas, quedaría un ciclo de tres módulos
(`store.ts -> api.ts -> client.ts -> store.ts`). Se rompe con inversión de
dependencias: `client.ts` expone `registerSessionAccessor(accessor)`, y
`features/auth/store.ts` se registra a sí mismo ahí, una única vez, después de crearse.
`client.ts` sigue sin saber qué es Zustand ni cómo se gestiona la sesión — solo que
"algo" le puede dar un token y refrescar la sesión cuando haga falta. Cualquier feature
futura que necesite hacer lo mismo (por ejemplo, para invalidar una caché local ante un
cambio de sesión) puede registrar su propio accessor sin que `client.ts` cambie.

### G. Refresh de token: cola single-flight, no un refresh por request fallida

El backend rota el refresh token en cada uso
([ADR-011](ADR-011-refresh-tokens-persistidos-en-postgres.md)): dos refresh
concurrentes invalidarían el token que el otro todavía no terminó de usar. El
interceptor de respuesta de `apiClient` mantiene una única promesa de refresh en vuelo
(`refreshPromise`, `shared/api/client.ts`) — toda request que reciba un 401 mientras ya
hay un refresh en curso espera esa misma promesa en vez de disparar la suya. Verificado
con un test que dispara dos 401 concurrentes y confirma que `refreshSession` se llamó
una sola vez (`shared/api/client.test.ts`).

### H. Persistencia de sesión en `localStorage`, con un hallazgo no anticipado sobre `onRehydrateStorage`

`features/auth/store.ts` persiste `accessToken`/`refreshToken`/`user` en `localStorage`
vía `zustand/middleware/persist`, para que refrescar la página no cierre la sesión.
Tradeoff aceptado: `localStorage` es legible por cualquier script que logre ejecutarse
en la página (XSS) — la alternativa real, cookies `httpOnly` emitidas por el backend,
está fuera de alcance porque esta épica prohíbe tocar el backend. Se mitiga con lo que
el backend ya provee: access token de vida corta (30 min) y rotación de refresh tokens
en cada uso.

**Hallazgo verificado empíricamente, no solo teórico**: con `localStorage` (una API
síncrona), Zustand ejecuta el callback de `onRehydrateStorage` de forma **síncrona,
durante la propia llamada a `create(...)`** — antes de que `const useAuthStore =
create(...)` termine de asignarse. Un primer intento de esta implementación llamaba
`useAuthStore.setState(...)` desde ese callback y fallaba en tiempo de ejecución
(`ReferenceError: Cannot access 'useAuthStore' before initialization` en desarrollo;
`TypeError: Cannot read properties of undefined` en el build de producción) — reprodu-
cible tanto en `vite dev` como en `vite preview`, así que no era un artefacto de Hot
Module Replacement. Se corrigió capturando `set` directamente del creator (que sí corre
antes de la rehidratación) en una variable de módulo, en vez de referenciar la
constante exportada del store. Ver el comentario extenso en `features/auth/store.ts`.

### I. `createBrowserRouter` (API de datos de React Router v7), guards anidados como rutas sin `path`

`RequireAuth` y `RequireRole` son elementos de ruta sin `path` propio, con `<Outlet />`
— no componentes que envuelven manualmente a cada página. Permite anidar la protección
declarativamente en el árbol de rutas (`app/router.tsx`): todo lo que cuelga de
`RequireAuth` exige sesión; lo que además cuelga de `RequireRole` exige, encima, un rol
puntual. Agregar una ruta nueva protegida es una entrada más en el árbol, nunca tocar
el guard en sí. `createBrowserRouter` (no `<BrowserRouter>` + `<Routes>`) porque es la
API recomendada actualmente y deja el terreno preparado para `loader`/`action` por ruta
el día que una pantalla necesite cargar datos antes de renderizar.

### J. Manejo global de errores: `normalizeApiError` + toasts sobre Zustand, no sobre Context

`shared/api/errors.ts` convierte cualquier error de una llamada HTTP (envelope del
backend, error de red, respuesta sin el envelope esperado, ni siquiera un error de
Axios) a una única forma predecible. `shared/toast/` expone una cola de avisos globales
sobre el mismo patrón de Zustand que el resto del estado compartido (no un
`Context.Provider` de toasts) — coherencia de un solo mecanismo de estado global en
toda la app, ver sección D.

## Alternativas consideradas

- **CSS Modules**: descartado por la sección C — el costo de mantener clases por
  variante de estado en un archivo aparte no compensa frente a la velocidad de
  Tailwind para una interfaz con muchos estados visuales cambiantes.
- **Context API para el estado de sesión**: descartado por la sección D — el objetivo
  no es esta épica, es dejar establecido el patrón para el estado de tiempo real que
  viene después.
- **Guardar los tokens solo en memoria (sin `persist`)**: más seguro contra XSS
  (nada persiste, un ataque solo roba lo que ya estaba en memoria en ese instante),
  pero cierra la sesión en cada refresco de página — inaceptable para una app que un
  usuario va a dejar abierta mirando un remate en vivo. Se descarta a favor de
  `localStorage` con las mitigaciones ya descriptas (sección H).
- **Un único cliente Axios con interceptores** (sin `rawClient` separado): técnicamente
  alcanzaría con la exclusión por URL del interceptor. Se descarta por la razón de la
  sección E: la separación estructural es más robusta que una lista de strings, al
  costo de una instancia extra de Axios.
- **Refresh por request** (sin cola single-flight): más simple de escribir, pero rompe
  con la rotación de refresh tokens del backend en cuanto dos requests fallan a la vez
  (ADR-011) — descartado, no es opcional dado cómo ya funciona el backend.

## Consecuencias

- **Ventajas**: agregar un feature nuevo (`features/remates/`, por ejemplo) es una
  carpeta nueva con el mismo esqueleto (`api.ts`, `store.ts` o no si no hace falta,
  `types.ts`, `pages/`), sin tocar `shared/` ni `app/`; el cliente HTTP y el manejo de
  JWT ya están resueltos para cualquier pantalla futura, que solo necesita llamar
  `apiClient`; los guards ya soportan cualquier combinación de roles sin cambiar su
  código; Zustand ya está probado como patrón de estado compartido para cuando llegue
  estado de tiempo real.
- **Desventajas aceptadas**: los tipos de la API (`features/auth/types.ts`,
  `shared/api/types.ts`) se mantienen a mano, reflejando los schemas de Pydantic del
  backend — sin generación automática desde el OpenAPI todavía (ver "Trabajo futuro" en
  [24-fundacion-frontend.md](../24-fundacion-frontend.md)); el Dockerfile del frontend
  es de desarrollo únicamente (Vite dev server + volumen montado), igual que ya acepta
  el del backend — una imagen de producción real es roadmap explícito, no de esta fase.
- El día que aparezca la primera pantalla con datos en tiempo real (sala del remate,
  eventos de WebSocket), el patrón a seguir es exactamente el de `features/auth/store.ts`:
  un store de Zustand por dominio, con sus propios selectores vía `useShallow` —
  ninguna decisión de esta fundación necesita revisarse para eso.
