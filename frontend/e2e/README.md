# Playwright — flujos reales de navegador bajo carga controlada

Esta carpeta cubre la Fase 11 del plan de pruebas de carga/estrés/concurrencia: usar
Playwright **únicamente** cuando hace falta simular comportamiento real de navegador
(login, entrar a un remate, ver lotes, ofertar, recibir actualizaciones en tiempo
real, ausencia de errores visuales críticos) mientras el sistema está bajo carga
generada por `k6/` o `loadtest/` en paralelo — nunca como sustituto de esas
herramientas para generar miles de usuarios simulados.

## Specs (Fase 11)

| Archivo | Cubre |
|---|---|
| `login.spec.ts` | Login exitoso (sesión activa, sin errores de consola) y login con credenciales inválidas (muestra error, no rompe). |
| `sala-realtime-bidding.spec.ts` | Flujo completo: login, entrar a la sala de un remate en vivo, lotes cargan, un comprador oferta, y **otro comprador conectado en paralelo ve el precio actualizarse solo, por WebSocket, sin recargar** -- prueba de punta a punta de tiempo real, no solo del HTTP. |
| `support/fixture.ts` | Reutiliza el remate/lote fixture ya sembrado por `k6/lib/fixtures.js` (misma convención de datos, Fase 4) vía la API pública -- correr `k6 run k6/smoke-test.js` primero si el entorno está vacío. |

Requiere el stack local levantado y las cuentas sintéticas de `k6/lib/identity.js` ya
registradas (`k6-buyer-00001@rematar.io`, `k6-buyer-00002@rematar.io`, `k6-empresa@
rematar.io` -- cualquier corrida previa de `k6/scenarios/buyers.js` con
`NUM_BUYERS>=2` ya las siembra).

Verificado corriendo bajo carga de fondo controlada (`k6 run --vus 20 --duration 60s
scenarios/buyers.js` en paralelo) -- los tres tests pasan sin errores de consola.

## Cómo correr (una vez que existan specs)

```bash
cd frontend
npm run test:e2e
```

Requiere el stack local levantado (`docker compose up -d` desde la raíz) y, para los
flujos de comprador/rematador, usuarios sintéticos ya sembrados (Fase 4).
