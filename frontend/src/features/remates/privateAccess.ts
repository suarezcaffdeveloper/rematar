/**
 * Lógica y textos de "Ingresar a remate privado" (`RedeemPrivateAccessPage`). Sin React,
 * así se testea sin montar nada.
 */

/** Pasos del canje, mismo formato explicativo que `OperatorClaimPage::CLAIM_STEPS`. */
export const REDEEM_STEPS = [
  {
    title: 'La empresa organiza un remate privado',
    description: 'Y te comparte la URL del remate junto con un código de acceso.',
  },
  {
    title: 'Ingresás los datos acá',
    description: 'Pegá la URL completa y el código en el formulario para canjearlo.',
  },
  {
    title: 'Entrás al remate',
    description: 'Pasás directo al detalle, con la misma sala y las mismas pujas que cualquier remate.',
  },
] as const;

export const URL_ERROR_MESSAGE = 'Pegá la URL completa que te compartió la empresa.';

/** Mensaje de error ante cualquier fallo del canje, siempre el mismo: ni el formulario ni el
 * backend (`RemateService.redeem_private_access`) distinguen "la URL no corresponde a ningún
 * remate", "el remate no es privado" o "el código es incorrecto" -- confirmar cualquiera de
 * esas distinciones filtraría información sobre remates que no deberían ser descubribles
 * (mismo criterio anti-enumeración que el 404 del detalle). */
export const GENERIC_REDEEM_ERROR = 'URL o código inválido.';

const REMATE_URL_PATTERN = /\/remates\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/** Extrae el UUID de remate de una URL pegada con la forma `.../remates/<uuid>` (con o
 * sin `/sala` o segmentos extra al final) -- la empresa comparte la URL completa
 * (`PrivateAccessPanel`), no un ID suelto, así que el formulario pide lo mismo que
 * recibió y el parseo queda de este lado. Devuelve `null` si no matchea, para no pegarle
 * al backend con algo que obviamente no es una URL de remate válida. */
export function extractRemateId(url: string): string | null {
  const match = url.trim().match(REMATE_URL_PATTERN);
  return match ? match[1] : null;
}
