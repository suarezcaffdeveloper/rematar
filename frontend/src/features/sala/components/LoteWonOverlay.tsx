import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { formatCurrency } from '../../../shared/lib/format';

export interface WonLoteInfo {
  lotNumber: string;
  title: string;
  finalPrice: string;
  currency: string;
}

export interface LoteWonOverlayProps {
  wonLote: WonLoteInfo | null;
  onContinue: () => void;
}

/**
 * Cartel de "ganaste el lote" para el comprador (pedido explícito): a diferencia de
 * `TransitionOverlay` (que se autodescarta), este se queda en pantalla hasta que la
 * persona lo cierra a mano con "Continuar" -- es información que no debería perderse
 * por un timeout mal calculado mientras alguien lee el monto final. Mismo lenguaje
 * visual (scrim + tarjeta blanca centrada + ícono en círculo de color + entrada suave
 * con `framer-motion`, `useReducedMotion` respetado) para que la sala no gane un
 * segundo estilo de "cartel superpuesto".
 */
export function LoteWonOverlay({ wonLote, onContinue }: LoteWonOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  if (!wonLote) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <motion.div
        role="alertdialog"
        aria-live="assertive"
        aria-label="Ganaste el lote"
        initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: 8 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-xl"
      >
        <motion.div
          initial={prefersReducedMotion ? undefined : { scale: 0.5, opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.05 }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-600"
        >
          <Trophy aria-hidden="true" className="h-8 w-8" />
        </motion.div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">¡Ganaste el lote!</h2>
          <p className="mt-1 text-sm text-slate-500">
            Lote {wonLote.lotNumber} · {wonLote.title}
          </p>
        </div>

        <p className="text-2xl font-extrabold tabular-nums text-brand-700">
          {formatCurrency(wonLote.finalPrice, wonLote.currency)}
        </p>

        <p className="text-sm leading-relaxed text-slate-600">
          Te enviamos un email y un mensaje por WhatsApp con los detalles de tu compra. El
          martillero se va a contactar con vos a la brevedad.
        </p>

        <Button onClick={onContinue} className="w-full py-2.5 text-sm font-semibold">
          Continuar
        </Button>
      </motion.div>
    </div>,
    document.body,
  );
}
