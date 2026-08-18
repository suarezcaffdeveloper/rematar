import { Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../shared/components/Button';

export interface AddLoteButtonProps {
  onClick: () => void;
  label?: string;
}

/**
 * CTA principal de la Gestión de Lotes (Épica 5, Módulo 5.3; rediseño a "centro de
 * preparación del remate") -- "Agregar lote" es la acción que de verdad importa en esta
 * pantalla, así que reusa el `Button` compartido en su variante `hero` (Épica 9, Etapa 4),
 * mismo tratamiento que `CreateRemateButton` para la acción principal de una pantalla, en
 * vez del gradiente + sombra de color propio que tenía antes. `label` opcional para
 * reusar el mismo look en el estado vacío ("Crear primer lote").
 */
export function AddLoteButton({ onClick, label = 'Agregar lote' }: AddLoteButtonProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="inline-block"
      whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <Button variant="hero" onClick={onClick} className="group px-5 py-2.5">
        <Plus aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
        {label}
      </Button>
    </motion.div>
  );
}
