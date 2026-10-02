import { STOCK_PHOTOS, type StockPhoto } from '../shared/media/stockPhotos';

/**
 * Contenido propio del ejemplo de landing v2. El copy largo (beneficios por rol, pasos,
 * funcionalidades, capturas y FAQ) se reutiliza tal cual desde `features/landing/data.ts`;
 * acá solo viven las piezas nuevas: los lotes que "se rematan" en el hero y los rubros.
 */

export interface HeroLot {
  key: string;
  rubro: string;
  photo: StockPhoto;
  lote: string;
  detalle: string;
  /** Precio inicial y salto de cada oferta simulada, en USD. */
  start: number;
  step: number;
  /** Precio de cierre que se muestra en la cinta de adjudicados. */
  vendido: number;
}

export const HERO_LOTS: HeroLot[] = [
  {
    key: 'hacienda',
    rubro: 'Hacienda',
    photo: STOCK_PHOTOS.ganado,
    lote: '40 terneros Angus',
    detalle: 'Lote 12 · Remate de hacienda general',
    start: 31_800,
    step: 250,
    vendido: 34_400,
  },
  {
    key: 'agricola',
    rubro: 'Maquinaria agrícola',
    photo: STOCK_PHOTOS.maquinariaAgricola,
    lote: 'Cosechadora Case IH 2388',
    detalle: 'Lote 04 · Año 2014 · 5.200 hs',
    start: 48_500,
    step: 500,
    vendido: 53_000,
  },
  {
    key: 'vehiculos',
    rubro: 'Vehículos',
    photo: STOCK_PHOTOS.vehiculos,
    lote: 'Toyota Hilux 4x4 SRV',
    detalle: 'Lote 21 · Año 2021 · 38.000 km',
    start: 31_200,
    step: 300,
    vendido: 33_900,
  },
  {
    key: 'pesada',
    rubro: 'Maquinaria pesada',
    photo: STOCK_PHOTOS.maquinariaPesada,
    lote: 'Retroexcavadora JCB 3CX',
    detalle: 'Lote 07 · Año 2018 · 6.100 hs',
    start: 39_800,
    step: 400,
    vendido: 42_700,
  },
  {
    key: 'antiguedades',
    rubro: 'Antigüedades',
    photo: STOCK_PHOTOS.antiguedades,
    lote: 'Reloj de pared francés',
    detalle: 'Lote 15 · Circa 1890 · Con péndulo',
    start: 2_400,
    step: 50,
    vendido: 3_150,
  },
];

export interface RubroPanel {
  key: string;
  name: string;
  /** Un lote típico del rubro, solo para dar contexto. */
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
