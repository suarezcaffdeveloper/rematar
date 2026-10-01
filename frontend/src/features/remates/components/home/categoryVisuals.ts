import {
  Beef,
  Building2,
  Car,
  Gem,
  Laptop,
  Package,
  Palette,
  Ship,
  Tractor,
  type LucideIcon,
} from 'lucide-react';
import type { RemateCategory } from '../../types';

/** Ícono de cada rubro -- se usa cuando un remate no tiene foto propia ni de sus lotes. */
export const CATEGORY_ICONS: Record<RemateCategory, LucideIcon> = {
  inmuebles: Building2,
  vehiculos: Car,
  maquinaria_pesada_y_agricola: Tractor,
  hacienda: Beef,
  arte_antiguedades_y_coleccionables: Palette,
  joyas_relojeria_y_numismatica: Gem,
  tecnologia_electrodomesticos_y_hogar: Laptop,
  nautica_y_aviacion: Ship,
  mercaderia_e_indumentaria: Package,
};

/** Fotos de rubro versionadas en `public/rubros` -- las usan las fichas grandes del
 * mosaico. Los rubros sin foto propia (joyas, náutica, tecnología, mercadería) no tienen
 * ficha con imagen. */
export const RUBRO_PHOTOS = {
  vehiculos: '/rubros/vehiculos.jpg',
  hacienda: '/rubros/hacienda-ganaderia.webp',
  maquinaria: '/rubros/maquinaria-pesada.jpg',
  arte: '/rubros/antiguedades-coleccionables.jpg',
} as const;
