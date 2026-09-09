// Alta e inicio de sesión de las identidades sintéticas que necesita un escenario de
// k6 -- mismo criterio que loadtest/loadtest/identity.py (Fase 4 del plan de pruebas
// de carga): todo vía la API pública (POST /auth/register, POST /auth/login), cero
// acceso directo a la base de datos, para que funcione contra cualquier entorno
// corriendo. `POST /auth/register` responde 201 (alta nueva) o 409 (ya existe, se
// tolera) -- así una corrida repetida reutiliza las mismas cuentas sin duplicar
// trabajo ni acumular usuarios sintéticos sin límite.
//
// A diferencia de loadtest/ (Python, cachea credenciales en disco entre corridas),
// un script de k6 no tiene acceso de escritura a filesystem entre iteraciones -- por
// eso cada corrida vuelve a pagar el costo de un login (barato) pero nunca el de un
// registro nuevo si la cuenta ya existe (Argon2id, el costo real, ver
// backend/app/modules/auth/security.py).

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL, BUYER_PASSWORD, EMAIL_DOMAIN, EMPRESA_PASSWORD, REMATADOR_PASSWORD } from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function registerOrLogin(email, password, fullName, role, phone) {
  const registerRes = http.post(
    `${API_BASE_URL}/auth/register`,
    JSON.stringify({
      email,
      password,
      confirm_password: password,
      full_name: fullName,
      phone,
      role,
    }),
    {
      headers: JSON_HEADERS,
      tags: { name: 'auth_register' },
      // 409 (ya existía) es un resultado esperado del patrón register-or-login, no
      // una falla -- sin esto, `http_req_failed` (que cuenta por status >=400) lo
      // computa como error real y ensucia el threshold global de cualquier escenario
      // que llame a esta función desde `setup()`.
      responseCallback: http.expectedStatuses(201, 409),
    }
  );
  check(registerRes, {
    'register: 201 (nueva) o 409 (ya existía)': (r) => r.status === 201 || r.status === 409,
  });

  const loginRes = http.post(
    `${API_BASE_URL}/auth/login`,
    `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, tags: { name: 'auth_login' } }
  );
  const loginOk = check(loginRes, { 'login: 200': (r) => r.status === 200 });
  if (!loginOk) {
    throw new Error(`No se pudo loguear ${email}: ${loginRes.status} ${loginRes.body}`);
  }
  const accessToken = loginRes.json('access_token');

  const meRes = http.get(`${API_BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    tags: { name: 'get_current_user' },
  });
  check(meRes, { 'users/me: 200': (r) => r.status === 200 });

  return { email, password, accessToken, userId: meRes.json('id') };
}

// Un comprador sintético identificado por índice -- mismo naming que loadtest/
// (`loadtest-buyer-00001@...`) pero con prefijo "k6-" para diferenciarlos en la
// misma base de datos compartida.
export function ensureBuyer(index) {
  const email = `k6-buyer-${String(index).padStart(5, '0')}@${EMAIL_DOMAIN}`;
  return registerOrLogin(
    email,
    BUYER_PASSWORD,
    `K6 Comprador ${String(index).padStart(5, '0')}`,
    'comprador',
    `+548${String(index).padStart(10, '0')}`
  );
}

// La empresa dueña comercial de los remates que crea este módulo de k6 (ADR-047: rol
// `empresa`, no `rematador`, es quien puede crear/programar/iniciar un remate).
export function ensureEmpresa() {
  return registerOrLogin(
    `k6-empresa@${EMAIL_DOMAIN}`,
    EMPRESA_PASSWORD,
    'K6 Empresa',
    'empresa',
    '+5480000000001'
  );
}

// El martillero (rol `rematador`) que opera en vivo un remate ya asignado por la
// empresa vía código de operador (ADR-048, ver fixtures.js:assignOperator). Por sí
// solo, un `rematador` recién registrado no tiene ningún remate asignado todavía.
export function ensureRematador() {
  return registerOrLogin(
    `k6-rematador@${EMAIL_DOMAIN}`,
    REMATADOR_PASSWORD,
    'K6 Martillero',
    'rematador',
    '+5480000000002'
  );
}
