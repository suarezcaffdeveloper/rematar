import { Bot, Gavel, History, KeyRound, LayoutDashboard, Package, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { UserRole } from '../../features/auth/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Navegación por rol (Épica 9, Etapa 2 -- rediseño; ampliada en ADR-047/ADR-048 con los
 * roles `empresa`/`rematador` acotado). `comprador`/`empresa` tienen su dashboard real
 * en `/` (`HomePage` ya rutea por rol, sin cambios); `admin` no tiene dashboard propio,
 * así que su único ítem apunta directo a `/admin` -- reemplaza el link condicional que
 * antes vivía suelto en el header (Épica 8.0). `empresa` hereda exactamente la
 * navegación que antes tenía `rematador` (crear/gestionar remates es ahora su
 * responsabilidad, ver ADR-047); `rematador` quedó sin remates propios que listar --
 * su único destino es `/` (`OperatorClaimPage`, canjear un código de operador).
 *
 * Fuente única para `Sidebar` (riel lateral) y `BuyerTopNav` (nav superior de la home):
 * antes vivía dentro de `Sidebar.tsx`.
 */
export const PUBLIC_NAV_ITEMS: NavItem[] = [{ label: 'Todos los remates', to: '/remates', icon: Gavel }];

export const NAV_ITEMS_BY_ROLE: Record<UserRole, NavItem[]> = {
  comprador: [
    { label: 'Remates', to: '/', icon: Gavel },
    { label: 'Ingresar a remate privado', to: '/remates-privados/ingresar', icon: KeyRound },
    { label: 'Mis compras', to: '/mis-compras', icon: ShoppingBag },
  ],
  empresa: [
    { label: 'Mis remates', to: '/', icon: Gavel },
    { label: 'Ventas adjudicadas', to: '/ventas-adjudicadas', icon: Package },
    { label: 'Historial', to: '/historial', icon: History },
    { label: 'Simuladores', to: '/simuladores', icon: Bot },
  ],
  rematador: [
    { label: 'Unirme a un remate', to: '/', icon: Gavel },
    { label: 'Simuladores', to: '/simuladores', icon: Bot },
  ],
  admin: [{ label: 'Panel de administrador', to: '/admin', icon: LayoutDashboard }],
};
