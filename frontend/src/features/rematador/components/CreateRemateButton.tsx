import { Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

export interface CreateRemateButtonProps {
  onClick: () => void;
}

/**
 * CTA principal del Dashboard del Rematador -- distinto del `Button` compartido a
 * propósito: es la única acción de la pantalla que necesita este nivel de énfasis
 * (gradiente de marca + microinteracciones), y llevar ese peso visual al `Button` base
 * afectaría cualquier otro botón "primary" de la app. `useReducedMotion` desactiva el
 * hover/tap gestual, mismo criterio que `shared/components/Reveal.tsx`.
 */
export function CreateRemateButton({ onClick }: CreateRemateButtonProps) {
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
      Crear remate
    </motion.button>
  );
}
