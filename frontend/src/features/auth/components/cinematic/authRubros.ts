import { CATEGORY_LABELS, CATEGORY_OPTIONS, CATEGORY_SHORT_LABELS } from '../../../remates/labels';
import type { RemateCategory } from '../../../remates/types';
import { AUTH_BACKGROUNDS, STOCK_PHOTOS, type StockPhoto } from '../../../../shared/media/stockPhotos';

export interface AuthRubro {
  category: RemateCategory;
  /** Nombre corto: el que se lee grande en el carrusel. */
  label: string;
  /** Nombre completo del rubro, como aparece en el resto de la app. */
  fullLabel: string;
  photo: StockPhoto;
}

const CATEGORY_PHOTOS: Record<RemateCategory, StockPhoto> = {
  inmuebles: STOCK_PHOTOS.inmuebles,
  vehiculos: AUTH_BACKGROUNDS.vehiculos,
  maquinaria_pesada_y_agricola: AUTH_BACKGROUNDS.maquinariaPesada,
  hacienda: AUTH_BACKGROUNDS.ganado,
  arte_antiguedades_y_coleccionables: AUTH_BACKGROUNDS.antiguedades,
  joyas_relojeria_y_numismatica: AUTH_BACKGROUNDS.joyas,
  tecnologia_electrodomesticos_y_hogar: STOCK_PHOTOS.tecnologia,
  nautica_y_aviacion: AUTH_BACKGROUNDS.nautica,
  mercaderia_e_indumentaria: STOCK_PHOTOS.indumentaria,
};

const ROTATION_ORDER: RemateCategory[] = [
  // Primero los que tienen foto propia (cargan al instante): es la que se ve al abrir la pantalla.
  'hacienda',
  'vehiculos',
  'maquinaria_pesada_y_agricola',
  'arte_antiguedades_y_coleccionables',
  ...CATEGORY_OPTIONS.filter(
    (category) =>
      ![
        'hacienda',
        'vehiculos',
        'maquinaria_pesada_y_agricola',
        'arte_antiguedades_y_coleccionables',
      ].includes(category),
  ),
];

/**
 * Un rubro por cada categoría real de remate (`CATEGORY_OPTIONS`): si el día de mañana se
 * agrega una categoría, el carrusel del login la toma sola -- sólo hace falta sumarle su foto
 * a `CATEGORY_PHOTOS` (TypeScript lo exige por el `Record`).
 */
export const AUTH_RUBROS: AuthRubro[] = ROTATION_ORDER.map((category) => ({
  category,
  label: CATEGORY_SHORT_LABELS[category],
  fullLabel: CATEGORY_LABELS[category],
  photo: CATEGORY_PHOTOS[category],
}));
