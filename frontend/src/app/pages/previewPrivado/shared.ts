import { useSearchParams } from 'react-router-dom';
import { LIVE_REMATES, SCHEDULED_REMATES, type MockRemate } from '../previewInicio/mockRemates';

/**
 * Datos y lógica simulada para las vistas previas de "Ingresar a remate privado"
 * (`/preview-privado-a`, `/preview-privado-b`) -- sin backend.
 */

/** Mismos tres pasos que muestra hoy `RedeemPrivateAccessPage` (`REDEEM_STEPS`). */
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

export const GENERIC_ERROR = 'URL o código inválido.';
export const URL_ERROR = 'Pegá la URL completa que te compartió la empresa.';

/** Misma extracción que `RedeemPrivateAccessPage::extractRemateId`: el UUID de una URL con
 * la forma `.../remates/<uuid>`. `null` si no matchea. */
export function extractRemateId(url: string): string | null {
  const match = url
    .trim()
    .match(/\/remates\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  return match ? match[1] : null;
}

/** Código de la demo: cualquier URL válida + este código "canjea" el remate. */
export const DEMO_CODE = 'REMATE24';
export const DEMO_REMATE: MockRemate = LIVE_REMATES[0];

/** Canje simulado: tarda un poco y, como el backend real, falla con un único error
 * genérico sin distinguir si falló la URL o el código. */
export function mockRedeem(url: string, code: string): Promise<MockRemate> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (extractRemateId(url) && code.trim().toUpperCase() === DEMO_CODE) resolve(DEMO_REMATE);
      else reject(new Error(GENERIC_ERROR));
    }, 900);
  });
}

/** Remates privados ya canjeados antes. `?canjeados=0` muestra el caso sin ninguno. */
export function useGrantedRemates(): MockRemate[] {
  const [params] = useSearchParams();
  if (params.get('canjeados') === '0') return [];
  return [LIVE_REMATES[1], SCHEDULED_REMATES[0], SCHEDULED_REMATES[4]];
}
