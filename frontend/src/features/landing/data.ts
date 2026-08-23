import {
  Activity,
  BarChart3,
  Boxes,
  Braces,
  Cloud,
  Cpu,
  Database,
  FileCode2,
  Gavel,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  Radio,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Workflow,
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
  { label: 'Tecnologías', href: '#tecnologias' },
  { label: 'Demo', href: '#demo' },
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

export const REMATADOR_BENEFITS: BenefitItem[] = [
  { icon: Gavel, title: 'Panel profesional', description: 'Una consola pensada para conducir un remate en vivo, no un panel de administración genérico.' },
  { icon: Layers, title: 'Gestión de lotes', description: 'Cargá, ordená y editá lotes antes de salir en vivo, con todo listo para el día del remate.' },
  { icon: Timer, title: 'Control del temporizador', description: 'Manejá el tiempo de cada lote en tiempo real, con extensiones y pausas bajo tu control.' },
  { icon: Shield, title: 'Moderación', description: 'Silenciá, expulsá o advertí participantes sin salir de la consola operativa.' },
  { icon: Users, title: 'Control de compradores', description: 'Visibilidad completa de quién está participando y cómo está ofertando cada uno.' },
  { icon: Zap, title: 'Oferta ganadora en vivo', description: 'La puja más alta se actualiza al instante para todos los presentes en la sala.' },
  { icon: MessageSquare, title: 'Chat integrado', description: 'Comunicate con los compradores sin depender de herramientas externas.' },
  { icon: BarChart3, title: 'Analytics en vivo', description: 'Métricas del remate mientras sucede: participación, ritmo de ofertas, adjudicaciones.' },
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
  { number: 1, title: 'El administrador crea un remate', description: 'Define fecha, condiciones y reglas del evento.' },
  { number: 2, title: 'Carga los lotes', description: 'Suma imágenes, descripciones y precios base a cada lote.' },
  { number: 3, title: 'Los compradores ingresan', description: 'Acceden a la sala del remate y ven los lotes disponibles.' },
  { number: 4, title: 'Comienzan las ofertas', description: 'Cada puja se refleja al instante para todos los participantes.' },
  { number: 5, title: 'El rematador administra el remate en vivo', description: 'Controla tiempos, modera y conduce cada lote desde la consola.' },
  { number: 6, title: 'Se adjudica el lote', description: 'La oferta ganadora queda registrada y el proceso post-remate comienza.' },
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

export interface TechItem {
  icon: LucideIcon;
  name: string;
}

export const BACKEND_TECH: TechItem[] = [
  { icon: FileCode2, name: 'Python' },
  { icon: Zap, name: 'FastAPI' },
  { icon: Database, name: 'PostgreSQL' },
  { icon: Server, name: 'Redis' },
  { icon: Radio, name: 'WebSockets' },
  { icon: Layers, name: 'SQLAlchemy' },
  { icon: Workflow, name: 'Alembic' },
  { icon: KeyRound, name: 'JWT' },
  { icon: Cloud, name: 'Docker' },
];

export const FRONTEND_TECH: TechItem[] = [
  { icon: Braces, name: 'React' },
  { icon: FileCode2, name: 'TypeScript' },
  { icon: Cpu, name: 'Vite' },
  { icon: Sparkles, name: 'Tailwind CSS' },
  { icon: Activity, name: 'Framer Motion' },
];

export interface FeatureCard {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: FeatureCard[] = [
  { icon: Radio, title: 'Remates en tiempo real', description: 'Cada oferta, cada segundo, sincronizado al instante entre todos los participantes.' },
  { icon: Zap, title: 'WebSockets', description: 'Comunicación bidireccional persistente, sin recargas ni polling.' },
  { icon: MessageSquare, title: 'Chat integrado', description: 'Conversación en vivo dentro de la misma sala del remate.' },
  { icon: ShieldCheck, title: 'Roles y permisos', description: 'Comprador, rematador y administrador, cada uno con su propio alcance.' },
  { icon: BarChart3, title: 'Dashboard', description: 'Información clara y accionable para cada tipo de usuario.' },
  { icon: Boxes, title: 'Gestión de lotes', description: 'Cargá, ordená y editá lotes antes y durante el remate.' },
  { icon: Timer, title: 'Temporizador', description: 'Control fino del tiempo de cada lote, con extensiones cuando hace falta.' },
  { icon: Shield, title: 'Moderación', description: 'Herramientas para mantener el orden durante un evento en vivo.' },
  { icon: Layers, title: 'Arquitectura modular', description: 'Backend organizado por dominios, fácil de extender.' },
  { icon: Lock, title: 'Escalable', description: 'Pensado para crecer en usuarios concurrentes sin perder velocidad.' },
  { icon: Cloud, title: 'Docker', description: 'Entornos reproducibles, del desarrollo a producción.' },
  { icon: Server, title: 'API REST', description: 'Contratos claros y documentados para cada recurso del sistema.' },
];
