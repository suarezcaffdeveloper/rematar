import { Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

export interface AddLoteButtonProps {
  onClick: () => void;
  label?: string;
}

/**
 * CTA principal de la Gestión de Lotes (Épica 5, Módulo 5.3; rediseño a "centro de
 * preparación del remate") -- "Agregar lote" es la acción que de verdad importa en esta
 * pantalla, así que lleva el mismo tratamiento que `CreateRemateButton` (gradiente de
 * marca + microinteracciones) en vez del `Button` "primary" genérico. `label` opcional
 * para reusar el mismo look en el estado vacío ("Crear primer lote").
 */
export function AddLoteButton({ onClick, label = 'Agregar lote' }: AddLoteButtonProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.03, y: -2 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-shadow duration-200 hover:shadow-xl hover:shadow-brand-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <Plus aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
      {label}
    </motion.button>
  );
}
