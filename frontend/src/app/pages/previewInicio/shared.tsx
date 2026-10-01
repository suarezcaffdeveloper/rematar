import {
  Building2,
  Car,
  Gem,
  Laptop,
  Palette,
  Ship,
  Tractor,
  Beef,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { RemateCategory } from '../../../features/remates/types';
import { formatCurrency } from '../../../shared/lib/format';
import type { MockRemate } from './mockRemates';

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

/** Nombres cortos para espacios chicos (los de `CATEGORY_LABELS` son largos). */
export const CATEGORY_SHORT: Record<RemateCategory, string> = {
  inmuebles: 'Inmuebles',
  vehiculos: 'Vehículos',
  maquinaria_pesada_y_agricola: 'Maquinaria',
  hacienda: 'Hacienda',
  arte_antiguedades_y_coleccionables: 'Arte y antigüedades',
  joyas_relojeria_y_numismatica: 'Joyas y relojería',
  tecnologia_electrodomesticos_y_hogar: 'Tecnología y hogar',
  nautica_y_aviacion: 'Náutica y aviación',
  mercaderia_e_indumentaria: 'Mercadería',
};

export function money(amount: number): string {
  return formatCurrency(String(amount), 'ARS');
}

const dayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const hourFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayShort = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const monthShort = new Intl.DateTimeFormat('es-AR', { month: 'short' });

export const formatDay = (d: Date) => dayFormatter.format(d);
export const formatHour = (d: Date) => `${hourFormatter.format(d)} h`;
export const formatWeekdayShort = (d: Date) => weekdayShort.format(d).replace('.', '');
export const formatMonthShort = (d: Date) => monthShort.format(d).replace('.', '');

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Miniatura cuadrada: foto si el remate la tiene, ícono del rubro si no. */
export function RemateThumb({ remate, className = '' }: { remate: MockRemate; className?: string }) {
  const Icon = CATEGORY_ICONS[remate.category];
  if (remate.image) {
    return (
      <img
        src={remate.image}
        alt=""
        style={{ objectPosition: remate.imagePosition }}
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <span className={`flex items-center justify-center bg-brand-50 text-brand-600 ${className}`}>
      <Icon className="h-1/2 w-1/2" strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

/** Punto "en vivo" con pulso -- mismo lenguaje que el contador del dashboard actual. */
export function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden="true">
      <span className="absolute inset-0 animate-ping rounded-full bg-success-400 opacity-75" />
      <span className="relative h-2 w-2 rounded-full bg-success-400" />
    </span>
  );
}
