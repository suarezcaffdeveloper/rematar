# ADR-011: Refresh tokens persistidos en PostgreSQL, con rotación

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

[RNF-12](../04-requisitos-no-funcionales.md) exige que los tokens de acceso sean de corta
duración y que el refresh token, que permite renovarlos sin pedir credenciales de nuevo,
sea **revocable**. Un JWT autocontenido (stateless) no es revocable por diseño: una vez
firmado, es válido hasta su expiración sin importar lo que pase en el servidor — si un
refresh token se filtra, no hay forma de invalidarlo antes de que expire por sí solo. La
Fase 1 explícitamente no incorpora Redis todavía, que sería el lugar natural para una
blacklist de tokens de corta vida.

## Decisión

Los **access tokens** siguen siendo JWT puramente stateless (de vida corta, ~30 minutos),
sin verificación contra la base en cada request — eso es lo que los hace baratos de validar
y es coherente con RNF-05 (nada de estado compartido en memoria entre instancias).

Los **refresh tokens** sí quedan respaldados por una tabla `refresh_tokens` en PostgreSQL
(user_id, jti, expires_at, revoked_at, created_at). El JWT del refresh token lleva un claim
`jti` que identifica su fila. Al usarlo:

1. Se valida la firma y expiración del JWT.
2. Se busca el `jti` en la tabla: si no existe, ya expiró lógicamente, o `revoked_at` no es
   nulo, se rechaza.
3. Se **rota**: la fila usada se marca revocada y se emite un refresh token nuevo con un
   `jti` nuevo. Esto sigue la práctica de OWASP de rotación de refresh tokens, que permite
   detectar reuso de un token robado (si alguien presenta un refresh token ya rotado, es
   señal de que dos partes tienen el mismo token, y se puede reaccionar revocando toda la
   sesión).
4. En logout, la fila correspondiente se marca revocada explícitamente.

## Alternativas consideradas

- **Refresh tokens puramente stateless, igual que el access token** (más simple, sin tabla):
  se descarta porque no cumple RNF-12 tal cual está documentado — no hay ninguna forma de
  revocar una sesión (por ejemplo, ante un "cerrar sesión en todos los dispositivos" o una
  cuenta comprometida) antes de que el token expire por sí solo.
- **Blacklist de tokens revocados en Redis** (guardar solo los `jti` invalidados, con TTL
  igual a la expiración restante del token): es el diseño natural una vez que Redis esté
  disponible, y de hecho probablemente reemplace o complemente esta tabla más adelante para
  reducir la carga de lecturas contra Postgres en el path de refresh. Se descarta **por
  ahora** únicamente porque esta fase excluye explícitamente Redis (instrucción del
  usuario), no porque la idea esté mal. Queda anotado como candidato de revisión cuando
  Redis se incorpore (fase de tiempo real).
- **Sin rotación, solo revocación en logout**: más simple de implementar, pero pierde la
  capacidad de detectar reuso de un refresh token robado — un atacante con un refresh token
  filtrado podría seguir usándolo indefinidamente hasta que el usuario cierre sesión
  manualmente (algo que probablemente nunca haga). Se descarta por ser una postura de
  seguridad más débil sin ahorro real de complejidad relevante.

## Consecuencias

- **Ventajas**: revocación real de sesiones cumpliendo RNF-12, detección de reuso de
  tokens robados vía rotación, todo sin depender de Redis en esta fase (coherente con el
  alcance pedido).
- **Desventajas aceptadas**: cada refresh implica una escritura transaccional en Postgres
  (marcar revocada la fila vieja + insertar la nueva), a diferencia de un esquema
  puramente stateless. Se acepta porque el endpoint de refresh se llama con mucha menor
  frecuencia que operaciones de lectura normales (una vez cada `ACCESS_TOKEN_EXPIRE_MINUTES`
  por sesión activa), así que el costo adicional es marginal.
- Cuando Redis se incorpore en una fase posterior, esta decisión debe revisarse: es
  candidata a moverse a Redis (TTL nativo, sin necesidad de limpiar filas expiradas a mano)
  o a un esquema híbrido. Ese cambio requerirá su propio ADR que supere a este.
