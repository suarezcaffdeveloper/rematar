import { STOCK_PHOTOS, type StockPhoto } from '../shared/media/stockPhotos';

/**
 * Contenido propio de la landing v4. El copy largo (beneficios, pasos, pantallas, FAQ) se
 * reutiliza de `features/landing/data.ts`; acá viven solo los lotes de la subasta del hero,
 * los rubros y el protagonista de cada paso del proceso.
 */

export interface HeroLot {
  key: string;
  rubro: string;
  photo: StockPhoto;
  lote: string;
  detalle: string;
  /** Precio inicial y salto de cada oferta, en USD. */
  start: number;
  step: number;
}

export const HERO_LOTS: HeroLot[] = [
  { key: 'hacienda', rubro: 'Hacienda', photo: STOCK_PHOTOS.ganado, lote: '40 terneros Angus', detalle: 'Lote 12 · Remate de hacienda general', start: 31_800, step: 250 },
  { key: 'agricola', rubro: 'Maquinaria agrícola', photo: STOCK_PHOTOS.maquinariaAgricola, lote: 'Cosechadora Case IH 2388', detalle: 'Lote 04 · Año 2014 · 5.200 hs', start: 48_500, step: 500 },
  { key: 'vehiculos', rubro: 'Vehículos', photo: STOCK_PHOTOS.vehiculos, lote: 'Toyota Hilux 4x4 SRV', detalle: 'Lote 21 · Año 2021 · 38.000 km', start: 31_200, step: 300 },
  { key: 'pesada', rubro: 'Maquinaria pesada', photo: STOCK_PHOTOS.maquinariaPesada, lote: 'Retroexcavadora JCB 3CX', detalle: 'Lote 07 · Año 2018 · 6.100 hs', start: 39_800, step: 400 },
  { key: 'antiguedades', rubro: 'Antigüedades', photo: STOCK_PHOTOS.antiguedades, lote: 'Reloj de pared francés', detalle: 'Lote 15 · Circa 1890 · Con péndulo', start: 2_400, step: 50 },
];

export interface RubroPanel {
  key: string;
  name: string;
  example: string;
  photo: StockPhoto;
}

export const RUBRO_PANELS: RubroPanel[] = [
  { key: 'inmuebles', name: 'Inmuebles', example: 'Casas, terrenos y locales', photo: STOCK_PHOTOS.inmuebles },
  { key: 'vehiculos', name: 'Automotores', example: 'Utilitarios, camiones y autos', photo: STOCK_PHOTOS.vehiculos },
  { key: 'pesada', name: 'Maquinaria pesada', example: 'Retroexcavadoras y grúas', photo: STOCK_PHOTOS.maquinariaPesada },
  { key: 'campo', name: 'Hacienda y campo', example: 'Hacienda en pie y maquinaria agrícola', photo: STOCK_PHOTOS.ganado },
  { key: 'arte', name: 'Arte y antigüedades', example: 'Relojes, muebles y coleccionables', photo: STOCK_PHOTOS.antiguedades },
  { key: 'joyas', name: 'Joyas y relojería', example: 'Piezas únicas y numismática', photo: STOCK_PHOTOS.joyas },
  { key: 'tecnologia', name: 'Tecnología y hogar', example: 'Equipos, electrodomésticos y más', photo: STOCK_PHOTOS.tecnologia },
  { key: 'nautica', name: 'Náutica y aviación', example: 'Embarcaciones y aeronaves', photo: STOCK_PHOTOS.nautica },
  { key: 'mercaderia', name: 'Mercadería', example: 'Indumentaria y lotes comerciales', photo: STOCK_PHOTOS.indumentaria },
];

export type StepOwner = 'Empresa' | 'Martillero' | 'Comprador' | 'Sistema';

/** Quién protagoniza cada uno de los 7 pasos de `TIMELINE_STEPS` (mismo orden). */
export const STEP_OWNERS: StepOwner[] = [
  'Empresa',
  'Empresa',
  'Empresa',
  'Martillero',
  'Comprador',
  'Martillero',
  'Sistema',
];

export const STATEMENT =
  'Un solo sistema para que la empresa arme el catálogo, el martillero conduzca la sala y el comprador ofrezca desde donde esté. Cada puja llega a todos en el mismo instante y cada adjudicación queda registrada.';

export interface TapeResult {
  lote: string;
  rubro: string;
  /** Precio de cierre de ejemplo, en USD. */
  precio: number;
}

/** Cierres de ejemplo para la cinta: ilustran cómo se ve un lote adjudicado. */
export const TAPE_RESULTS: TapeResult[] = [
  { lote: '40 terneros Angus', rubro: 'Hacienda', precio: 34_400 },
  { lote: 'Cosechadora Case IH 2388', rubro: 'Maquinaria agrícola', precio: 53_000 },
  { lote: 'Toyota Hilux 4x4 SRV', rubro: 'Vehículos', precio: 33_900 },
  { lote: 'Retroexcavadora JCB 3CX', rubro: 'Maquinaria pesada', precio: 42_700 },
  { lote: 'Reloj de pared francés', rubro: 'Antigüedades', precio: 3_150 },
  { lote: 'Casa de dos plantas, 320 m²', rubro: 'Inmuebles', precio: 186_000 },
  { lote: 'Lancha Sea Ray 24 pies', rubro: 'Náutica', precio: 61_500 },
  { lote: 'Anillo de oro y esmeralda', rubro: 'Joyas', precio: 4_800 },
];

/** Fotografía de fondo de cada uno de los 7 pasos del proceso (mismo orden que `TIMELINE_STEPS`). */
export const STEP_PHOTOS: StockPhoto[] = [
  STOCK_PHOTOS.inmuebles,
  STOCK_PHOTOS.maquinariaPesada,
  STOCK_PHOTOS.antiguedades,
  STOCK_PHOTOS.vehiculos,
  STOCK_PHOTOS.ganado,
  STOCK_PHOTOS.maquinariaAgricola,
  STOCK_PHOTOS.atardecer,
];
