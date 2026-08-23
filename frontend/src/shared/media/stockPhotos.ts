/**
 * Fotografías compartidas por más de una feature -- la landing (`features/landing`,
 * sección "¿Qué es RematAR?"), el login y el registro (`features/auth`) muestran
 * exactamente el mismo pool, así que viven acá en vez de que `features/auth` dependa
 * de `features/landing`. `ganado`, `maquinariaAgricola`, `vehiculos`,
 * `maquinariaPesada` y `antiguedades` son fotos propias (`public/rubros/`, no
 * Unsplash) -- reemplazo fácil: el día que cambien, alcanza con estos valores.
 * `inmuebles` sigue siendo la foto de stock original (Unsplash) a propósito.
 */

export interface StockPhoto {
  url: string;
  alt: string;
}

function unsplash(id: string, alt: string): StockPhoto {
  return { url: `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`, alt };
}

export const STOCK_PHOTOS = {
  ganado: { url: '/rubros/hacienda-ganaderia.webp', alt: 'Hacienda y ganadería' },
  ganadoCloseup: unsplash('1500595046743-cd271d694d30', 'Vacas pastando al atardecer'),
  campo: unsplash('1500382017468-9049fed747ef', 'Campo iluminado por el sol'),
  maquinariaAgricola: { url: '/rubros/maquinaria-agricola.jpg', alt: 'Maquinaria agrícola en el campo' },
  inmuebles: unsplash('1600585154340-be6161a56a0c', 'Fachada de una propiedad moderna'),
  vehiculos: { url: '/rubros/vehiculos.jpg', alt: 'Automotores y vehículos' },
  maquinariaPesada: { url: '/rubros/maquinaria-pesada.jpg', alt: 'Maquinaria pesada y agrícola' },
  antiguedades: { url: '/rubros/antiguedades-coleccionables.jpg', alt: 'Arte - Antigüedades - Coleccionables' },
  joyas: unsplash('1515562141207-7a88fb7ce338', 'Joyas - Relojería - Numismática'),
  tecnologia: unsplash('1550009158-9ebf69173e03', 'Tecnología - Electrodomésticos - Hogar'),
  nautica: unsplash('1567899378494-47b22a2ae96a', 'Náutica y aviación'),
  indumentaria: unsplash('1441986300917-64674bd600d8', 'Lotes de mercadería e indumentaria'),
  paisaje: unsplash('1441974231531-c6227db76b6e', 'Paisaje natural abierto'),
  atardecer: unsplash('1493932484895-752d1471eab5', 'Atardecer sobre el campo'),
} as const;
