import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, ChevronsRight, Gavel } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { formatCurrency } from '../../../shared/lib/format';

export interface AdjudicatedLoteInfo {
  lotNumber: string;
  title: string;
  finalPrice: string;
  currency: string;
  /** Módulo de Bots Simuladores -- `true` si la oferta ganadora la generó un simulador
   * (`OfertaSnapshotEntry.is_bot`, nunca enmascarado). */
  isBot?: boolean;
}

export interface LoteAdjudicadoOverlayProps {
  adjudicatedLote: AdjudicatedLoteInfo | null;
  onAdvance: () => void;
  onCancel: () => void;
}

/**
 * Cartel de confirmación al adjudicar un lote (Consola Operativa, `ConsolaControlPanel`
 * -- botón "Adjudicar lote"). Mismo lenguaje visual que `LoteWonOverlay`/
 * `TransitionOverlay` (scrim + tarjeta blanca centrada + ícono en círculo de color +
 * `framer-motion`, `useReducedMotion` respetado), pero con `AnimatePresence`: a
 * diferencia de esos dos (que se descartan sin transición), este también tiene una
 * salida animada -- pedido explícito de que tanto la entrada como la salida tengan una
 * transición cuidada. Tokens `ink`/`line`/`surface-subtle` (no `slate`) porque vive en
 * la Consola Operativa, ya retexturizada a ese sistema (`ConsolaControlPanel`,
 * `ConsolaLotePanel`, etc.) -- coherente con el resto de la pantalla en la que aparece.
 *
 * Sin nombre del comprador: `ConsolaControlPanel` la usa el rematador operador
 * asignado (nunca la empresa dueña, que no opera desde acá), y el snapshot le
 * enmascara `buyer_id` (`SnapshotService._is_privileged`, ADR-026 sección D -- solo
 * dueño/admin) -- la misma política de anonimato entre postores que ya aplica en toda
 * la app (`OfferHistoryPanel`, "Comprador líder"), no un hueco a resolver acá. En vez
 * de inventar un identificador, reusa el mismo rótulo genérico que ya usa
 * `OfferHistoryPanel` para el comprador líder ("Comprador verificado" + ícono
 * `BadgeCheck`), distinguiendo solo el caso de un bot simulador (`isBot`, el único dato
 * de identidad que sí llega sin enmascarar).
 *
 * Dos acciones (a diferencia de `LoteWonOverlay`, que solo tiene "Continuar"):
 * "Pasar al siguiente lote" (dispara `onAdvance` -- en `ConsolaControlPanel` reusa la
 * misma acción que el botón homónimo del panel de control) y "Cancelar", que
 * ÚNICAMENTE cierra el cartel: no deshace la adjudicación (ya se hizo contra el backend
 * antes de que este cartel se muestre) ni toca el lote activo. Mismas variantes que
 * `ConfirmModal` ("ghost" para cancelar/`primary` -- default de `Button` -- para
 * confirmar) para que se lea como una decisión real entre dos botones, no un "Cerrar"
 * genérico al lado de la acción principal.
 */
export function LoteAdjudicadoOverlay({ adjudicatedLote, onAdvance, onCancel }: LoteAdjudicadoOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  return createPortal(
    <AnimatePresence>
      {adjudicatedLote && (
        <motion.div
          key="lote-adjudicado-backdrop"
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            role="alertdialog"
            aria-live="assertive"
            aria-label="Lote adjudicado"
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: 8 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-xl"
          >
            <motion.div
              initial={prefersReducedMotion ? undefined : { scale: 0.5, opacity: 0 }}
              animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.05 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-600"
            >
              <Gavel aria-hidden="true" className="h-8 w-8" />
            </motion.div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-success-700">Lote adjudicado</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">¡Lote adjudicado!</h2>
              <p className="mt-1 text-sm text-ink-faint">
                Lote {adjudicatedLote.lotNumber} · {adjudicatedLote.title}
              </p>
            </div>

            <div className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-left">
              <BadgeCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-success-600" />
              <p className="text-sm font-medium text-ink">
                {adjudicatedLote.isBot ? 'Comprador simulado (bot)' : 'Comprador verificado'}
              </p>
            </div>

            <p className="text-2xl font-extrabold tabular-nums text-brand-700">
              {formatCurrency(adjudicatedLote.finalPrice, adjudicatedLote.currency)}
            </p>

            <div className="flex w-full gap-2">
              <Button variant="ghost" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={onAdvance} className="flex-1 !gap-2">
                Pasar al siguiente lote
                <ChevronsRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
