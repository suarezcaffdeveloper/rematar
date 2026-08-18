import { Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../shared/components/Button';

export interface CreateRemateButtonProps {
  onClick: () => void;
}

/**
 * CTA principal del Dashboard del Rematador -- reusa el `Button` compartido en su
 * variante `hero` (Épica 9, Etapa 4: fondo `ink` que pasa a azul de marca en hover,
 * pensada justo para "la acción más importante de una pantalla") en vez del gradiente +
 * sombra de color propio que tenía antes -- ese tratamiento a medida quedaba fuera del
 * lenguaje visual del resto del rediseño. Sigue siendo un componente aparte (no un
 * `<Button>` suelto en el JSX del dashboard) por la microinteracción del ícono, que sí
 * es propia de esta pantalla. `useReducedMotion` desactiva el gesto de escala, mismo
 * criterio que `shared/components/Reveal.tsx`.
 */
export function CreateRemateButton({ onClick }: CreateRemateButtonProps) {
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
        Crear remate
      </Button>
    </motion.div>
  );
}
