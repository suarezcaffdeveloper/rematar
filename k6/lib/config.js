// Config compartida por todos los escenarios de k6.
//
// Mismo criterio que loadtest/loadtest/config.py: un único lugar navegable, todo
// parametrizable por variable de entorno, ningún default apunta a un entorno
// productivo -- siempre localhost, para correr contra el `docker compose up` local
// descrito en el README raíz.
//
// Uso: k6 run -e BASE_URL=http://localhost:8000 scenarios/visitors.js

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
export const API_PREFIX = '/api/v1';
export const API_BASE_URL = `${BASE_URL}${API_PREFIX}`;

// Credenciales del admin bootstrapeado (app/scripts/create_superuser.py) -- solo
// necesarias para escenarios que consulten endpoints admin-only. Mismos defaults que
// loadtest/loadtest/config.py para no tener que recordar dos convenciones distintas.
export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@rematar.io';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'administrador123';

// Convención de datos sintéticos (Fase 4 del plan de pruebas de carga) -- mismo
// dominio que ya usa loadtest/ (loadtest/loadtest/identity.py: "rematar.io" no es un
// TLD reservado por IANA, a diferencia de ".local"/".test", que email-validator
// rechaza), prefijo "k6-" para diferenciar de "loadtest-" en la misma base. Nunca
// reusar este dominio/prefijo para una cuenta real; nunca generar datos con otro
// dominio.
export const EMAIL_DOMAIN = 'rematar.io';
export const BUYER_PASSWORD = 'k6-buyer-pass-1234';
export const EMPRESA_PASSWORD = 'k6-empresa-pass-1234';
export const REMATADOR_PASSWORD = 'k6-rematador-pass-1234';
