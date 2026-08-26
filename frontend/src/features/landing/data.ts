import {
  Activity,
  BarChart3,
  Boxes,
  Gavel,
  Layers,
  MessageSquare,
  Monitor,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { STOCK_PHOTOS, type StockPhoto } from '../../shared/media/stockPhotos';

/**
 * Contenido de la landing pública (`features/landing`), separado de los componentes
 * para que ajustar copy/imágenes/stack no obligue a tocar JSX. Las fotografías en sí
 * viven en `shared/media/stockPhotos.ts` (compartidas con el login, ver
 * `features/auth/pages/LoginPage.tsx`) -- acá sólo se las referencia por rubro.
 */

export interface NavLink {
  label: string;
  href: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Características', href: '#caracteristicas' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Plataforma', href: '#plataforma' },
];

export interface RubroItem {
  label: string;
  photo: StockPhoto;
}

export const RUBROS: RubroItem[] = [
  { label: 'Inmuebles', photo: STOCK_PHOTOS.inmuebles },
  { label: 'Automotores y vehículos', photo: STOCK_PHOTOS.vehiculos },
  { label: 'Maquinaria pesada y agrícola', photo: STOCK_PHOTOS.maquinariaPesada },
  { label: 'Hacienda y ganadería', photo: STOCK_PHOTOS.ganado },
  { label: 'Arte - Antigüedades - Coleccionables', photo: STOCK_PHOTOS.antiguedades },
  { label: 'Joyas - Relojería - Numismática', photo: STOCK_PHOTOS.joyas },
  { label: 'Tecnología - Electrodomésticos - Hogar', photo: STOCK_PHOTOS.tecnologia },
  { label: 'Náutica y aviación', photo: STOCK_PHOTOS.nautica },
  { label: 'Lotes de mercadería e indumentaria', photo: STOCK_PHOTOS.indumentaria },
];

export interface BenefitItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const EMPRESA_BENEFITS: BenefitItem[] = [
  { icon: Layers, title: 'Gestión de remates y lotes', description: 'Creá remates, cargá el catálogo de lotes con imágenes y precios base, y organizá cada evento desde cero.' },
  { icon: Users, title: 'Asignación de rematadores', description: 'Designá operadores para cada remate y controlá quién conduce el evento en vivo.' },
  { icon: BarChart3, title: 'Panel de administración', description: 'Visualizá resultados globales, adjudicaciones, ventas post-remate y métricas de tus eventos.' },
  { icon: Boxes, title: 'Control de inventario', description: 'Administrá la documentación, fotos y estado de cada lote hasta su venta final.' },
  { icon: ShieldCheck, title: 'Aprobaciones y seguridad', description: 'Validá participantes, auditá acciones y mantené el control sobre qué usuarios ingresan a cada evento.' },
  { icon: Zap, title: 'Resultados en tiempo real', description: 'Seguí cada puja, lote adjudicado y comprador ganador sin salir del panel de la empresa.' },
];

export const REMATADOR_BENEFITS: BenefitItem[] = [
  { icon: Gavel, title: 'Consola operativa en vivo', description: 'Una interfaz pensada exclusivamente para conducir el remate: lote actual, pujas y compradores al instante.' },
  { icon: Timer, title: 'Control del temporizador', description: 'Manejá el tiempo de cada lote en tiempo real, con extensiones y pausas bajo tu control.' },
  { icon: Shield, title: 'Moderación', description: 'Silenciá, expulsá o advertí participantes sin salir de la consola operativa.' },
  { icon: Users, title: 'Control de compradores', description: 'Visibilidad completa de quién está participando y cómo está ofertando cada uno.' },
  { icon: Zap, title: 'Oferta ganadora en vivo', description: 'La puja más alta se actualiza al instante para todos los presentes en la sala.' },
  { icon: MessageSquare, title: 'Chat integrado', description: 'Comunicate con los compradores sin depender de herramientas externas.' },
];

export const COMPRADOR_BENEFITS: BenefitItem[] = [
  { icon: Boxes, title: 'Visualización del lote', description: 'Imágenes, video y toda la información del lote, clara y a mano antes de ofertar.' },
  { icon: Radio, title: 'Ofertas en vivo', description: 'Segui cómo sube la puja en tiempo real, sin recargar la página ni perder el ritmo.' },
  { icon: Activity, title: 'Historial', description: 'Repasá cada oferta hecha durante el remate, la tuya y la del resto.' },
  { icon: MessageSquare, title: 'Chat', description: 'Consultá al rematador o a otros participantes sin salir de la sala.' },
  { icon: Timer, title: 'Seguimiento del remate', description: 'Sabé siempre qué lote está en juego y cuánto tiempo queda.' },
  { icon: Sparkles, title: 'Experiencia intuitiva', description: 'Pensada para participar sin fricción, desde cualquier dispositivo.' },
];

export interface TimelineStep {
  number: number;
  title: string;
  description: string;
}

export const TIMELINE_STEPS: TimelineStep[] = [
  { number: 1, title: 'La empresa crea el remate', description: 'Define fecha, condiciones y reglas del evento.' },
  { number: 2, title: 'Carga los lotes', description: 'Suma imágenes, descripciones y precios base a cada lote.' },
  { number: 3, title: 'Asigna al rematador', description: 'La empresa designa el operador que conducirá el evento en vivo.' },
  { number: 4, title: 'El rematador inicia el remate', description: 'Accede con sus credenciales a la consola operativa y abre la sala del remate.' },
  { number: 5, title: 'Los compradores ingresan', description: 'Acceden a la sala del remate y ven los lotes disponibles.' },
  { number: 6, title: 'El rematador conduce el remate en vivo', description: 'Controla tiempos, modera y conduce cada lote desde la consola.' },
  { number: 7, title: 'Se adjudica el lote', description: 'La oferta ganadora queda registrada y el proceso post-remate comienza.' },
];

export interface SystemScreen {
  /** Sirve de `key` de React y de sufijo de la URL falsa en `MockupWindow`. */
  key: string;
  title: string;
  description: string;
  /** Ruta bajo `public/screenshots/` -- capturas reales de la app corriendo, no
   * recreaciones. */
  image: string;
}

export const SYSTEM_SCREENS: SystemScreen[] = [
  {
    key: 'remates',
    title: 'Remates disponibles',
    description: 'El comprador explora los remates en vivo y programados a los que puede sumarse.',
    image: '/screenshots/remates-disponibles.png',
  },
  {
    key: 'remate-lotes',
    title: 'Detalle del remate',
    description: 'Toda la información del evento, descripción y catálogo de lotes antes de entrar a la sala.',
    image: '/screenshots/remate-detalle-lotes.png',
  },
  {
    key: 'sala',
    title: 'Sala en vivo',
    description: 'Oferta actual, tiempo restante, puja rápida y chat del remate en tiempo real.',
    image: '/screenshots/sala-en-vivo.png',
  },
  {
    key: 'panel-rematador',
    title: 'Panel del rematador',
    description: 'Mis remates: estado, creación, métricas globales y accesos rápidos a cada evento.',
    image: '/screenshots/panel-rematador.png',
  },
  {
    key: 'consola-rematador',
    title: 'Consola del rematador',
    description: 'El martillero modera y conduce el remate en vivo: temporizador, pujas y compradores en directo.',
    image: '/screenshots/consola-rematador.png',
  },
  {
    key: 'historial-remate',
    title: 'Historial y resultados',
    description: 'Resumen ejecutivo, valor adjudicado, métricas clave y resultado lote por lote al finalizar el remate.',
    image: '/screenshots/historial-remate.png',
  },
  {
    key: 'ventas-adjudicadas',
    title: 'Ventas adjudicadas',
    description: 'Seguimiento y gestión post-remate del martillero: contacto, cobro y entrega de cada lote vendido.',
    image: '/screenshots/ventas-adjudicadas.png',
  },
  {
    key: 'seguimiento',
    title: 'Seguimiento de mi compra',
    description: 'El comprador sigue el progreso post-remate paso a paso, desde la adjudicación y pago hasta la entrega.',
    image: '/screenshots/seguimiento-compra.png',
  },
];

export interface FeatureCard {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: FeatureCard[] = [
  { icon: Radio, title: 'Remates en tiempo real', description: 'Cada oferta se actualiza al instante para todos los presentes, sin recargar la página.' },
  { icon: MessageSquare, title: 'Chat integrado', description: 'Comprador y rematador se comunican sin salir de la sala del remate.' },
  { icon: Users, title: 'Un panel para cada rol', description: 'Empresa, rematador y comprador tienen su propia vista, con solo lo que necesitan ver.' },
  { icon: Boxes, title: 'Gestión de lotes', description: 'Catálogo con imágenes, precios base y estado de cada lote, de principio a fin.' },
  { icon: Shield, title: 'Moderación y seguridad', description: 'Validación de participantes y herramientas para mantener el orden durante el evento.' },
  { icon: BarChart3, title: 'Resultados en tiempo real', description: 'Adjudicaciones, ventas y métricas de cada remate, siempre a mano.' },
  { icon: Layers, title: 'Múltiples rubros', description: 'Inmuebles, vehículos, hacienda, arte y más: un mismo sistema para cualquier categoría.' },
  { icon: Timer, title: 'Seguimiento post-remate', description: 'El comprador sigue el progreso de su compra hasta la entrega final.' },
  { icon: Monitor, title: 'Desde cualquier dispositivo', description: 'Pensado para participar y administrar remates desde celular, tablet o computadora.' },
];
