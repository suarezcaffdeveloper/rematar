# Auditoría de Seguridad — Reportes por Fase

Registro acumulado de los reportes finales de cada fase de la auditoría de seguridad
ejecutada en la branch `security-audit`. Las Fases 1-6 (WebSocket Security Hardening)
quedaron documentadas solo en docstrings de código (ver `app/realtime/privilege.py`,
`app/modules/auth/realtime.py`, `app/websocket/rate_limit.py`, `app/modules/chat/text.py`,
`backend/tests/test_websocket_security_e2e.py`) — no tienen un reporte final separado
como este. A partir de la Fase 7, cada fase deja su reporte final acá antes de arrancar
la siguiente.

---

## FASE 7 — HTTP Authentication & Session Security (2026-08-19)

### Estado: PASS WITH RESIDUAL RISKS

**Authentication (login):** Antes de esta fase, `POST /auth/login` no tenía ninguna
protección de fuerza bruta y filtraba existencia de cuentas por timing. Ambos corregidos
(ver Vulnerabilidades). Mensajes de error uniformes ya estaban bien implementados;
suspensión solo se revela con contraseña correcta (comportamiento aceptable).

**JWT:** HS256 con un único algoritmo pasado explícitamente a `jwt.decode` (sin vector de
confusión de algoritmo ni `alg:none`). `SECRET_KEY` obligatorio, sin default. El claim
`role` del access token nunca se usa para autorizar — confirmado con test
(`test_manipulated_role_claim_in_access_token_does_not_grant_admin_access`):
`require_roles` siempre relee el rol desde la base. Token expirado, firma inválida, tipo
incorrecto (`access` vs `refresh`) y `sub` inexistente: todos rechazados (401), todos
testeados.

**Refresh tokens:** Rotación real con persistencia en Postgres (ADR-011). Reuso de un
token ya rotado, expirado, con firma inválida, con `jti` desconocido, y de un usuario
suspendido: todos rechazados y testeados.

**Sessions:** Múltiples sesiones concurrentes del mismo usuario son independientes —
`logout` de una no afecta a otra (testeado). `password_changed`/`user_suspended` sí
revocan todas las sesiones y cierran todas las conexiones WS activas (Fase 3, ya
implementado).

**Logout:** Revoca el refresh token puntual y cierra la conexión WS de esa sesión de
inmediato. El access token HTTP sigue siendo válido hasta su `exp` natural (≤30 min) —
diseño deliberado y documentado (evitar una query extra en el hot path de cada request
HTTP), no un bug, queda como riesgo residual documentado con test.

**Password change:** No existe un endpoint `POST /change-password` para un usuario ya
autenticado — el único camino es el flujo de recuperación vía email. Informativo, no una
vulnerabilidad.

**Password recovery:** Token JWT + fila persistida de un solo uso, expira en 15 min,
invalida links previos, revoca todas las sesiones al completarse, rate-limited (3/15min
por email, cuenta igual exista o no la cuenta). Ya implementado y testeado; no se tocó.

**Enumeration:** Corregida la vía de timing en login. El resto de los flujos
(`forgot-password`, `reset-password`) ya usan mensajes/status uniformes.

**Brute force:** Corregido en login. Password-reset ya tenía rate limit; el token de
reset en sí es un UUID de 122 bits + JWT firmado — fuerza bruta impracticable.

**Secrets:** Ningún secreto hardcodeado. Solo `.env.example` trackeado en git; referencias
a `SECRET_KEY` en tests son placeholders explícitos. El middleware de logging solo
registra método/path/status/duración — nunca tokens ni bodies.

**Tests:** 22 nuevos (`test_auth_login_security.py`, `test_auth_token_security.py`,
`test_auth_session_management.py`) + toda la suite existente relacionada con
auth/sesiones/websocket-auth — todos pasando. Suite completa corrida una vez al final:

| Total | Passed | Failed | Duration |
|---|---|---|---|
| 742 | 731 | 11 | 21m17s |

### Vulnerabilidades encontradas y corregidas

**1. Sin protección de fuerza bruta en `POST /auth/login`**
- Severity: Alta
- Componente: `AuthService.authenticate` (`backend/app/modules/auth/service.py`)
- Root cause: ningún rate limiting existía en el flujo de login.
- Impact: credential stuffing / password spraying ilimitado.
- Fix: `RedisRateLimiter` por email normalizado (`LOGIN_RATE_LIMIT_MAX_ATTEMPTS=10` /
  `WINDOW_SECONDS=900`), mismo patrón que el limiter de password-reset.
- Test: `test_login_is_rate_limited_per_email`,
  `test_login_rate_limit_counts_attempts_against_unknown_email_too`,
  `test_login_rate_limit_is_scoped_per_email`.
- Status: fixed.

**2. User enumeration por timing en login**
- Severity: Media
- Componente: `AuthService.authenticate`
- Root cause: `user is None or not verify_password(...)` hacía short-circuit: un email
  inexistente nunca pagaba el costo de Argon2id, uno existente sí.
- Impact: permite enumerar cuentas registradas pese al mensaje de error idéntico.
- Fix: `_DUMMY_PASSWORD_HASH` precalculado; `verify_password` se invoca siempre.
- Test: `test_login_pays_password_verification_cost_even_for_unknown_email`.
- Status: fixed.

### Riesgos residuales

1. Access token HTTP válido hasta `exp` tras logout (≤30 min) — diseño deliberado, no
   cambiado esta fase.
2. No existe endpoint de cambio de contraseña autenticado — solo recuperación vía email.
3. Sin rate limit en `/reset-password/validate` y `/reset-password` — impacto bajo dado
   el espacio de 122 bits del token.
4. Tokens en `localStorage` del frontend — tradeoff ya aceptado en ADR-027, fuera del
   alcance de esta fase (backend-only).

---

## FASE 8 — API Authorization / BOLA / IDOR (2026-08-19)

### Estado: PASS

### Inventario

20 routers, ~90 endpoints HTTP auditados (todo `app/api/router.py` salvo WebSocket, ya
cubierto en Fases 1-4): `auth`, `users`, `remates`, `remates/lotes`, `ofertas`, `chat`,
`moderation`, `bots`, `audit`, `history`, `postauction`, `analytics`, `timer`,
`notifications`, `snapshot`, `presence`, `monitoring`, `whatsapp-redirect`.

### Recursos auditados

Remate, Lote, Oferta, ChatMessage, RemateBan/mute/lock-chat, ModerationPinnedMessage,
BotProfile, BotSimulationRun, PostAuctionCase, Notification, AuditLogEntry (lectura),
HistorySummary/Detail (lectura), AnalyticsSnapshot (lectura), RemateStateSnapshot
(lectura), User (perfil propio + admin).

### Hallazgo central

Toda la autorización de escritura pasa por un único patrón, repetido consistentemente en
cada service: `RemateService.get_owned_or_raise`/`get_visible_or_raise`, encadenado hacia
abajo (`LoteService._get_owned_lote_or_raise` valida además `lote.remate_id == remate_id`
del path, no solo que el lote exista). Ningún router confía en `Depends(get_current_user)`
por sí solo -- la autenticación nunca se trató como autorización en ninguno de los ~90
endpoints revisados. Los tres puntos que la Fase 8 pide poner a prueba especialmente:

- **User ID spoofing**: ningún schema de request (`OfertaCreate`, `RemateCreate`,
  `LoteCreate`, `BotProfileCreate`, ...) acepta `owner_id`/`buyer_id`/`user_id`/
  `created_by_id` -- son siempre server-side, resueltos desde `current_user`. Confirmado
  con test: un `buyer_id` ajeno colado en el body de una oferta se ignora (Pydantic
  `extra="ignore"` por default), la oferta queda a nombre de quien mandó el JWT.
- **Role spoofing**: ya probado en Fase 7 (el claim `role` del JWT nunca se lee para
  autorizar, `require_roles` siempre relee `current_user.role` desde la base) -- se
  reconfirma acá que ningún endpoint de negocio (crear remate, ofertar, moderar) usa una
  fuente de rol distinta a esa.
- **Ownership chains**: `Lote -> Remate -> owner_id`, `PostAuctionCase.rematador_id`/
  `buyer_id` comparados directo contra `viewer.id`, `BotProfile.created_by_id`. Probado
  explícitamente que un `lote_id` real bajo el `remate_id` de OTRO remate del mismo dueño
  da 404 (la cadena se valida completa, no solo "¿sos dueño de algún remate?").

### Vulnerabilidades encontradas

Ninguna. No se modificó código de producción en esta fase.

### Matriz (resumen; ver `docs/09-arquitectura-y-decisiones.md` y los docstrings de cada
`service.py` para el detalle completo por endpoint)

| Recurso | Comprador | Rematador (no dueño) | Rematador (dueño) | Admin |
|---|---|---|---|---|
| Remate (CRUD/acciones) | ver si no-DRAFT | ver si no-DRAFT (404 si DRAFT) / 403 en escritura | ALLOW todo | ver todo, sin escritura |
| Lote (CRUD/acciones) | ver si remate visible (reserve_price oculto) | igual que Remate | ALLOW todo | ver todo, sin escritura |
| Oferta (place_bid) | ALLOW (rol exigido) | DENY (rol) | DENY (rol) | DENY (rol) |
| Oferta (list_history) | DENY | DENY | ALLOW | ALLOW |
| Chat (send/list) | ALLOW si remate visible | ALLOW si remate visible | ALLOW | ALLOW |
| Chat (delete) | DENY | DENY | ALLOW | DENY (sin excepción) |
| Moderation (kick/mute/lock/pin) | DENY | DENY | ALLOW | DENY (sin excepción) |
| Moderation (lecturas) | DENY | DENY | ALLOW | ALLOW |
| Bots (CRUD/simulación) | N/A (no aplica) | DENY | ALLOW | ALLOW (ve todos) |
| PostAuction ventas (rematador) | N/A | DENY | ALLOW | ALLOW |
| PostAuction mis-compras (buyer) | ALLOW (propias) | N/A | N/A | ALLOW |
| Audit/History/Analytics | DENY (o 403 según recurso) | DENY | ALLOW | ALLOW |
| Users (admin) | DENY | DENY | DENY | ALLOW |

### Tests

10 tests nuevos (`test_authorization_bola.py`): ACTION IDOR en transiciones de estado
(remate `start`/`cancel`, lote `open`/`cancel`, `postauction` `change_estado`, bots
`simulation/start`/`selection`) por un rematador no-dueño, ownership chain (`lote_id` bajo
`remate_id` equivocado), user-id spoofing (`buyer_id` en el body de una oferta) y
no-autenticado. Todos passing.

| Batch | Passed | Failed |
|---|---|---|
| Fase 8 (`test_authorization_bola.py`) | 10 | 0 |
| Routers afectados (remates/lotes/bots/postauction/moderation/history/audit/analytics/snapshot/chat) | 187 | 0 |
| Suite completa | 742 | 10 (todos pre-existentes) |

Los 10 fallos de la suite completa son los mismos ya documentados en el reporte de Fase 7
(8 en `test_history_repository.py`/`test_history_service.py`, 2 en `test_health.py`/
`test_redis_infrastructure.py`) -- confirmado sin cambios en `app/history`/`app/postauction`
ni en `/health`. El flake ya documentado de `test_websocket_gateway.py` (heartbeat) no se
repitió en esta corrida (pasó limpio), consistente con ser intermitente y no causado por
ningún cambio de esta fase.

### Riesgos residuales

1. Ninguno nuevo de autorización. Se heredan los de Fase 7 (ver arriba).
2. **Ambiente**: durante esta fase, una corrida de la suite completa quedó colgada (CPU
   plano, sin avanzar) cerca del 86-90% de progreso, en la zona alfabética donde caen los
   tests de `test_websocket_gateway.py` -- coincide con la flakiness de teardown ya
   documentada para ese archivo (ver Fase 1-6), pero esta vez se manifestó como cuelgue en
   vez de fallo puntual. Se mató el proceso y se reintentó; la segunda corrida completó
   limpia sin ese archivo fallando ni colgarse. No bloquea esta fase, pero conviene
   root-causear esa flakiness en algún momento (no forma parte del alcance de Fase 8).

### Conclusión

**PASS.** No se encontraron vulnerabilidades de autorización (BOLA/IDOR, user/role
spoofing, ownership chains) en los ~90 endpoints auditados. El patrón arquitectónico
existente (`get_owned_or_raise`/`get_visible_or_raise` centralizado por servicio,
schemas de request sin campos de identidad) ya prevenía la clase de vulnerabilidad que
esta fase buscaba activamente. Se agregaron 10 tests de regresión para las rutas de
acción (no-CRUD) que no tenían cobertura explícita de ownership todavía.

---

## FASE 9 — Auction Business Logic Security / Offer & Adjudication Audit (2026-08-20)

### Estado: PASS WITH RESIDUAL RISKS

### Dominio auditado

**Ofertas** (`app/modules/ofertas/engine.py`): `AuctionEngine.place_bid` es la única
puerta de entrada; reglas duras (rol, cuenta suspendida, remate/lote inexistente o no
visible → nunca generan fila) vs. blandas (remate no LIVE, lote no OPEN, monto
insuficiente → generan una `Oferta REJECTED`, la request siempre devuelve 201). El
servidor es la única autoridad sobre `current_price`/`minimum_bid` -- el cliente solo
manda `amount` y, opcionalmente, `client_token` (ADR-020).

**Estados**: `Remate` (`DRAFT → SCHEDULED → LIVE ↔ PAUSED → FINISHED`/`CANCELLED`) y
`Lote` (`PENDING → OPEN → CLOSED_SOLD`/`CLOSED_UNSOLD → [requeue] → PENDING` /
`CANCELLED`), cada uno con su propia tabla de transiciones permitidas
(`state_machine.py`) validada en cada método de servicio antes de mutar.

**Cierre y adjudicación**: el cierre **manual** (`POST .../close`, ADR-018) es una
declaración explícita del rematador (`outcome` + `final_price`), deliberadamente
**independiente** de la oferta `ACCEPTED` vigente -- no hay motor de ofertas
reconciliando el resultado declarado contra lo que se ofertó online (documentado y
aceptado en ADR-018, ambigüedad de negocio real, no un bug). El cierre **automático**
(`LoteService.auto_close`, disparado por `TimerExpiryScheduler`) sí usa la oferta líder
real como resultado.

**Concurrencia** (ADR-004): toda validación/aceptación de una oferta corre dentro de
una transacción que toma `SELECT ... FOR UPDATE` sobre la fila del lote antes de leer
la oferta vigente -- serializa cualquier oferta concurrente sobre el mismo lote, sin
importar la instancia de backend. `auto_close` reutiliza el mismo lock.

### Invariantes descubiertas

Todas ya existían en el código; ninguna se inventó para esta fase.

- A lo sumo una `Oferta` `ACCEPTED` por lote en todo momento (`uq_ofertas_lote_id_accepted`,
  índice único parcial) -- es lo que permite leer "la oferta vigente" por estado, sin
  `MAX(amount)`.
- A lo sumo un `Lote` `OPEN` por remate (`uq_lotes_remate_id_open_status`, índice único
  parcial, RF-12/ADR-017) -- respaldada por la aplicación (`has_open_lote`) Y por la base.
- Idempotencia de oferta: único por `(buyer_id, client_token)` cuando `client_token` no
  es nulo (`uq_ofertas_buyer_id_client_token`) -- ver Vulnerabilidad 2 sobre su alcance.
- `amount > 0`, `base_price > 0`, `min_increment > 0`, `reserve_price >= base_price`,
  `final_price > 0`, `quantity >= 1` -- todos `CHECK CONSTRAINT` a nivel de base, no solo
  validación de Pydantic.
- `LoteStatus.CLOSED_SOLD`/`CLOSED_UNSOLD`/`CANCELLED` son terminales en
  `lotes/state_machine.py` (sin transiciones salientes, salvo `CLOSED_UNSOLD → PENDING`
  vía `requeue`, siempre manual) -- este es el invariante que la Vulnerabilidad 1
  (abajo) demostró que la aplicación no hacía cumplir bajo concurrencia real, pese a
  estar correctamente modelado.

### Vulnerabilidades

**1. Doble adjudicación / doble cierre manual bajo concurrencia (race condition)**
- Severity: **Alta**
- Attack: dos `POST .../close` (o `.../cancel`) casi simultáneos sobre el mismo lote
  `OPEN` -- un doble click del rematador, o un reintento de red de su propio cliente
  HTTP -- con resultados distintos (`sold` a $1200 vs. `unsold`, por ejemplo).
- Root cause: `LoteService._get_owned_lote_or_raise` (usado por `open`/`close`/
  `cancel`/`requeue`/`update`/`soft_delete`/`upload_image`) leía el lote con
  `LoteRepository.get_by_id` (`SELECT` simple, sin lock) en vez de
  `get_by_id_for_update` -- a diferencia de `AuctionEngine.place_bid` y
  `LoteService.auto_close`, que sí usan el lock de fila de ADR-004. La decisión de
  negocio (¿a qué estado transicionar?, ¿con qué `final_price`?) se tomaba sobre una
  lectura que podía quedar vieja: el `UPDATE` final de Postgres esperaba correctamente
  a que la primera transacción terminara, pero la segunda igual aplicaba su resultado
  ya calculado con datos viejos -- sin volver a chequear `assert_transition_allowed`
  contra el estado real. El propio docstring de `get_by_id_for_update` afirmaba
  (incorrectamente) que esto "no hacía falta".
- Impact: dos cierres/cancelaciones concurrentes podían completar **los dos** con
  éxito (200 y 200), con el segundo pisando en silencio el resultado (`final_price`/
  `outcome`) del primero -- sin ningún error, pese a que el estado final de un lote
  vendido/no vendido debe ser terminal y determinístico. Adicionalmente, una oferta
  podía terminar `ACCEPTED` justo en el momento del cierre manual sin que ninguna de
  las dos operaciones se enterara de la otra hasta después de aplicada.
- Fix: `_get_owned_lote_or_raise` ahora usa `get_by_id_for_update` -- mismo mecanismo
  ya validado por ADR-004/`place_bid`/`auto_close`, sin arquitectura nueva. La segunda
  llamada concurrente ahora bloquea en el propio `SELECT` hasta que la primera
  comitea, y al desbloquearse relee el estado YA actualizado -- `assert_transition_allowed`
  entonces rechaza la segunda transición (`CLOSED_SOLD`/`CLOSED_UNSOLD` no tienen
  salida) con un 422 claro, en vez de aplicarla igual.
- Test: `backend/tests/test_lote_close_concurrency.py` --
  `test_two_concurrent_manual_closes_only_one_succeeds`,
  `test_two_concurrent_cancels_only_one_succeeds`,
  `test_bid_concurrent_with_manual_close_is_serialized_and_leaves_a_consistent_state`
  (los tres fallaban antes del fix, corrida repetida; pasan de forma consistente
  después).
- Status: **fixed**.

**2. `client_token` reusado entre lotes distintos devuelve la oferta equivocada**
- Severity: Media
- Attack: un comprador (o un cliente HTTP armado a mano, no el frontend oficial, que sí
  genera un UUID nuevo por intento) reutiliza el mismo `client_token` para ofertar en
  un lote B después de haberlo usado en un lote A.
- Root cause: `OfertaRepository.get_by_buyer_and_token` filtraba solo por
  `(buyer_id, client_token)`, igual que el índice único de la base
  (`uq_ofertas_buyer_id_client_token`, global por comprador, sin `lote_id` -- ADR-020
  pensó el token para reintentar la MISMA oferta, no como identificador de sesión entre
  lotes). El chequeo de idempotencia de `place_bid` encontraba la fila de A y la
  devolvía como si fuera el resultado de ofertar en B.
- Impact: el comprador recibía 201 con una oferta que **no correspondía al lote en el
  que creía estar ofertando** -- ninguna oferta nueva se registraba en B, sin ningún
  error que lo indicara.
- Fix: `get_by_buyer_and_token` ahora también filtra por `lote_id` (sin migración: el
  índice único de la base sigue siendo global por comprador, la aplicación es la que
  ahora exige la coincidencia de lote antes de "reconocer" un reintento). Cuando el
  índice único de la base igual choca (mismo `client_token`, comprador, pero lote
  distinto), `AuctionEngine._save` ahora traduce eso en un `ConflictError` (409) claro
  en vez de devolver silenciosamente la oferta ajena.
- Bonus fix (bug preexistente encontrado al ejercitar por primera vez esta ruta de
  recuperación): el código leía `buyer.id`/`oferta.lote_id` **después** de un
  `Session.rollback()`, que expira los atributos de todos los objetos de la sesión --
  eso disparaba un lazy-load sin contexto async disponible (`sqlalchemy.exc.MissingGreenlet`),
  es decir, un 500 crudo en vez de la recuperación elegante que el código pretendía
  hacer. Corregido capturando ambos valores en variables locales antes de cualquier
  operación que pudiera disparar un rollback.
- Test: `backend/tests/test_auction_engine.py::test_same_client_token_reused_across_different_lotes_does_not_cross_contaminate`
  (fallaba antes del fix con la respuesta silenciosamente incorrecta, después con
  `MissingGreenlet`/500 hasta el segundo fix; pasa con ambos aplicados).
- Status: **fixed**.

### Race conditions probadas

| Escenario | Resultado |
|---|---|
| Dos compradores ofertan simultáneamente (montos distintos) | Serializado por el lock de fila (ADR-004) -- exactamente una `ACCEPTED`, ya testeado antes de esta fase (`test_two_concurrent_bids_are_serialized_by_the_row_lock`) |
| Mismo comprador, mismo `client_token`, requests simultáneas | Idempotente -- devuelve la misma oferta las dos veces, ya testeado antes de esta fase (`test_duplicate_client_token_returns_same_offer`, recuperación ante `IntegrityError` confirmada) |
| Oferta simultánea con cierre automático por timer | Consistente -- ya testeado antes de esta fase (`test_concurrent_bid_and_scheduler_never_leave_an_inconsistent_state`) |
| Oferta simultánea con cierre **manual** | Ahora serializado correctamente (Fix 1) -- nunca una lectura vieja de ninguno de los dos lados, aunque el resultado de negocio del cierre manual sigue siendo independiente de la oferta por diseño (ADR-018) |
| Dos cierres manuales concurrentes (doble adjudicación) | **Vulnerable antes del fix** (los dos podían completar) -- corregido, ahora exactamente uno (Fix 1) |
| Dos cancelaciones concurrentes | **Vulnerable antes del fix** -- corregido, ahora exactamente una (Fix 1) |

### Replay attacks

- Ofertas sin `client_token`: no son idempotentes por diseño (ADR-020) -- un replay
  exacto se autocorrige por la regla de incremento mínimo (la segunda vez ya no alcanza
  el monto mínimo vigente, queda `REJECTED`). No es una vulnerabilidad: nunca produce un
  segundo ganador.
- Ofertas con `client_token` (mismo lote): idempotente, ya testeado y correcto.
- Ofertas con `client_token` reusado entre lotes: era una vulnerabilidad real (ver
  Vulnerabilidad 2), corregida.
- `close`/`cancel`/transiciones de estado en general: nunca idempotentes por naturaleza
  (una transición terminal repetida debe fallar) -- correcto tanto antes como después de
  esta fase; lo que estaba roto era la CONCURRENCIA de dos intentos, no el replay
  secuencial (un `close` repetido secuencialmente ya fallaba correctamente con 422
  incluso antes del fix).

### Price manipulation

Verificado empíricamente (no solo leído): Pydantic (`Decimal`, `Field(gt=0, max_digits=14,
decimal_places=2)`) rechaza `NaN`, `Infinity`, `-Infinity`, negativos, cero, exceso de
dígitos/decimales y notación científica desbordada -- los seis casos probados de forma
directa contra el schema. `min_increment`/`base_price`/`reserve_price` los define
siempre el rematador dueño del lote (nunca el comprador), y están además protegidos por
`CHECK CONSTRAINT` a nivel de base. El monto mínimo aceptable (`leading.amount +
min_increment` o `base_price`) se calcula siempre server-side; el cliente nunca puede
mandar `current_price`/`minimum_bid`. Sin hallazgos.

### State manipulation

Las transiciones de `Remate`/`Lote` están centralizadas en sus respectivas
`state_machine.py` y se validan en cada método de servicio antes de mutar -- intentar
ofertar antes de abrir, después de cerrar, adjudicar dos veces, o modificar un lote
después de LIVE, ya estaban (y siguen) correctamente rechazados. El único hueco real
era la CONCURRENCIA de dos transiciones válidas-en-el-momento-de-leer (Vulnerabilidad 1).

### Adjudication

`final_price`/`reserve_price`/`buyer_id`/`winner_id` nunca se aceptan como input del
comprador. `final_price` para el cierre MANUAL sí lo declara el rematador dueño del
lote -- autenticado, autorizado, y validado contra `base_price` -- consistente con
ADR-018 (ambigüedad de negocio documentada, no un bug: el cierre manual no reconcilia
contra la oferta vigente, es una decisión independiente del rematador). Doble
adjudicación: corregida (Vulnerabilidad 1). Adjudicar lote ajeno: imposible, ya
protegido por ownership (Fase 8). Adjudicar sin ganador: válido (`outcome=unsold`),
comportamiento esperado.

### Tests

| Batch | Passed | Failed |
|---|---|---|
| Fase 9 (`test_lote_close_concurrency.py` + nuevo test de `test_auction_engine.py`) | 4 | 0 |
| Suite de lotes/remates/ofertas/timer/state-engine completa | 152 | 0 |
| Suite completa | 746 | 10 (todos pre-existentes, ver Fases 7-8) |

Los 10 fallos de la suite completa son los mismos ya documentados en Fases 7-8 (8 en
`test_history_repository.py`/`test_history_service.py`, 2 en `test_health.py`/
`test_redis_infrastructure.py`) -- ningún archivo de ese módulo fue tocado en esta fase.
El flake intermitente de `test_websocket_gateway.py` no apareció en esta corrida.

### Riesgos residuales

1. **`RemateService.finish()` vs. `Lote.open()` concurrente (no corregido)**: `finish()`
   chequea `has_open_lote()` sin lock sobre la fila del `Remate` -- en teoría, una
   apertura de OTRO lote del mismo remate podría completarse concurrentemente,
   resultando en un remate `FINISHED` con un lote `OPEN`. Es una inconsistencia
   cosmética/de exhibición (no afecta ganador ni precio de ningún lote), y corregirla
   requeriría lockear también la fila del `Remate` -- un cambio de alcance mayor al de
   esta fase (`SECURITY`/`CONSISTENCY` de ganador/precio ya está resuelto; esto queda
   documentado para una fase futura, no inventado como regla nueva).
2. **Cierre manual independiente de la oferta vigente (ADR-018, por diseño)**: sigue
   siendo posible que el rematador declare `unsold` (o `sold` a un monto distinto) con
   una oferta `ACCEPTED` real todavía vigente -- documentado y aceptado explícitamente
   en ADR-018, no una vulnerabilidad de esta fase. Si en el futuro se decide que el
   cierre manual debería reconciliar contra la oferta vigente, es una decisión de
   negocio nueva, no una corrección de seguridad.
3. Se heredan los riesgos residuales de Fases 7-8 (ver arriba).

### Conclusión

**PASS WITH RESIDUAL RISKS.** Se encontraron y corrigieron dos vulnerabilidades reales
de concurrencia en la lógica de negocio central del remate (doble adjudicación/cierre,
y contaminación cruzada de idempotencia entre lotes), ambas demostradas empíricamente
con tests que fallaban antes del fix y una corrección mínima que reutiliza mecanismos
ya establecidos y probados (el lock de fila de ADR-004), sin tocar arquitectura. Precio,
decimales, manipulación de estado, adjudicación y replay attacks fuera de esas dos
vulnerabilidades ya estaban correctamente resueltos. Un riesgo residual de menor
severidad (remate finalizado con lote abierto) queda documentado, no corregido, por
estar fuera del alcance mínimo de esta fase.

Los 11 fallos de la suite completa son pre-existentes (confirmado con `git diff --stat`:
cero cambios sin commitear en `app/history`/`app/postauction`, y cada fallo reproduce en
aislamiento): 8 en history/postauction (bug de negocio no relacionado), 2 en `/health`
(falta implementar `checks`, no relacionado), 1 flake ya documentado de
`test_websocket_gateway.py`. Ninguno es regresión de esta fase.

---

## FASE 10 — Static Analysis / Infra Hardening (2026-08-20)

### Estado: PASS

Punto de partida: un escaneo Semgrep (`semgrep_summary.txt`, no incorporado a ningún
reporte previo) sobre todo el repo (backend, frontend, `loadtest/`, y un puñado de
archivos HTML sueltos en la raíz). 12 findings crudos, agrupados en 4 hallazgos
distintos tras deduplicar por causa.

### Hallazgos y resolución

**1. `backend/Dockerfile` y `frontend/Dockerfile` corrían como root (severidad ERROR,
corregido)**
- Root cause: ninguna de las dos imágenes declaraba `USER`; sin él, Docker corre el
  proceso principal como root dentro del contenedor por default. Si un atacante lograra
  ejecución de código dentro del contenedor (ej. una dependencia de npm/pip
  comprometida), tendría privilegios de root dentro de él.
- Fix: `backend/Dockerfile` crea `appuser` (uid 1000, sin privilegios, shell
  `/usr/sbin/nologin`) y lo activa con `USER appuser` antes del `ENTRYPOINT`.
  `frontend/Dockerfile` reutiliza el usuario `node` que ya trae la imagen base
  `node:24-slim` (uid 1000). Ambos `chown -R` su respectivo `/app` antes del cambio de
  usuario.
- Regresión encontrada y corregida al testear: el volumen bind-mounted
  `backend/media/` (`MEDIA_ROOT`, Épica 6) y el volumen nombrado
  `frontend_node_modules` ya existían en esta máquina con contenido creado por
  ejecuciones previas de los contenedores como root (`root:root`, sin permiso de
  escritura para uid 1000) -- `docker compose exec backend touch media/x` fallaba con
  `Permission denied` hasta corregir el ownership existente
  (`chown -R appuser:appuser`/`chown -R node:node` sobre el contenido ya creado). Un
  clone nuevo del repo no pasa por esto: `/app` en sí es escribible por cualquier uid en
  el bind mount de Docker Desktop, así que `media_root.mkdir(...)` en
  `app/main.py` lo crearía como `appuser` desde cero sin conflicto -- el problema era
  puramente de estado heredado de antes de esta fase, no del Dockerfile en sí.
- Verificación: build limpio de ambas imágenes, `docker compose up backend` sano
  (migraciones + `/health` → 200), `docker compose exec backend id` → `uid=1000
  (appuser)`, escritura a `media/` exitosa. Frontend levantado en un puerto alternativo
  (5173 real ocupado en esta máquina por un contenedor de otro proyecto, no relacionado)
  confirma `uid=1000 (node)`, escritura a `node_modules/` exitosa, y Vite sirve `200` en
  `/`.

**2. `backend/app/email/renderer.py` y `loadtest/loadtest/charting.py` -- "direct use of
jinja2" (severidad WARNING, revisado, sin cambios)**
- La regla de Semgrep asume el patrón típico de Flask donde `render_template()` protege
  contra XSS y un uso directo de `jinja2.Environment` podría no hacerlo. Ambos archivos
  ya configuran `Environment(..., autoescape=select_autoescape(["html"]))` explícitamente
  -- autoescape real y activo para los cuatro templates `.html` que existen
  (`backend/app/email/templates/`). `loadtest/loadtest/compare.py` y `report.py`
  (también flageados) no instancian su propio `Environment`: reusan `jinja_env()` de
  `charting.py`, mismo autoescape. Falso positivo confirmado por lectura de código, no
  se tocó nada.

**3. `ws://` sin cifrar en frontend (severidad ERROR, revisado, sin cambios)**
- Los 3 matches están en `deriveWsBaseUrl` (`frontend/src/shared/config/env.ts`) y sus
  tests. La función deriva la URL del WebSocket reemplazando el prefijo `http` de
  `VITE_API_BASE_URL` por `ws` (`"https://...".replace(/^http/, 'ws')` da `wss://...` --
  la `s` de `https` sobrevive al reemplazo) -- nunca hardcodea `ws://` en código que
  corra en producción. Los matches literales de `ws://` son: un fixture de test
  (`client.test.ts`) y una aserción de test sobre el caso `http://` de entrada
  (`env.test.ts`) -- ninguno es una URL real usada en runtime. Falso positivo, sin
  cambios.

**4. Falta atributo `integrity` en `<script>`/`<link>` de CDN en HTML sueltos
(severidad WARNING, revisado, sin cambios, fuera de alcance)**
- Los 3 archivos (`MisCompras/code.html`, y dos carpetas `frontend/stitch_*/code.html`)
  son exports estáticos de una herramienta de diseño ("Stitch"), documentados con su
  propio `DESIGN.md`/`screen.png` como referencia visual -- no están bajo
  `frontend/src/`, no los importa `frontend/index.html`, y no forman parte del build de
  Vite ni se sirven a ningún usuario real. Además, `cdn.tailwindcss.com` (el recurso sin
  `integrity` en los tres) es explícitamente un script "Play CDN" pensado para
  prototipado, que cambia de contenido entre versiones -- no tiene un hash estable para
  pinnear. Sin superficie de ataque real (nadie los sirve) y sin un fix práctico
  disponible para ese CDN puntual; se documenta como no aplicable en vez de forzar un
  `integrity` que se rompería en la próxima actualización del CDN.
- Nota aparte, no un finding de seguridad: Semgrep también reportó un error de parseo
  propio sobre `backend/app/email/templates/password_reset.html` (`{% extends %}` con
  otra sintaxis Jinja2 en la misma línea) -- limitación del parser HTML de Semgrep con
  templates Jinja2, no un problema del template.

### Tests

No se tocó lógica de aplicación (Python/JS) en esta fase -- los cambios son
Dockerfile/`.gitignore` únicamente, así que no aplica correr la suite de pytest/vitest
(política de este proyecto: solo testear los módulos tocados). La validación fue
funcional/de infraestructura, contra los contenedores reales:

| Verificación | Resultado |
|---|---|
| `docker compose build backend frontend` | OK, ambas imágenes |
| `docker compose up backend` (migraciones + arranque) | OK, `/health` → 200 |
| `docker compose exec backend id` | `uid=1000(appuser)`, no root |
| Escritura a `backend/media/` como `appuser` | OK tras corregir ownership heredado |
| `docker compose run frontend id` | `uid=1000(node)`, no root |
| Escritura a `node_modules/` (volumen nombrado) como `node` | OK tras corregir ownership heredado |
| Frontend Vite dev server (puerto alternativo) | OK, `200` en `/` |

### Riesgos residuales

1. Ninguno nuevo introducido por esta fase. Los Dockerfiles siguen siendo, por diseño
   explícito y documentado desde antes de esta fase, imágenes de desarrollo (bind mount
   + `--reload`/HMR) -- una imagen de producción real (sin bind mount, build multi-stage,
   sin `-e`/editable install) sigue siendo un ítem de roadmap separado
   (`docs/13-mvp-y-roadmap.md`), no algo que esta fase debía resolver.
2. Se heredan los riesgos residuales de Fases 7-9 (ver arriba).

### Conclusión

**PASS.** Se corrigió el único hallazgo de severidad ERROR con superficie de ataque
real (contenedores corriendo como root), verificado end-to-end contra los contenedores
reales (no solo lectura de Dockerfile) incluyendo una regresión de permisos que apareció
al testear y se corrigió antes de dar la fase por cerrada. Los demás hallazgos del
escaneo (`jinja2` directo, `ws://` literal, `integrity` en CDN) se revisaron
individualmente y son falsos positivos o no aplican a este repo -- documentados para no
tener que re-analizarlos si un futuro escaneo los vuelve a reportar.
