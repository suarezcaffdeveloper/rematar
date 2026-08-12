import { PackageX } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import type { Lote } from '../../remates/types';

export interface DesiertoLoteNoticeProps {
  /** `null` -- oculto. El lote que acaba de cerrarse sin adjudicación. */
  lote: Lote | null;
  onClose: () => void;
}

/**
 * Aviso de lote desierto (Módulo de lotes desiertos) -- se dispara apenas
 * `ConsolaControlPanel` cierra el lote activo sin ofertas (con "Cerrar lote" o "Pasar al
 * siguiente lote", da igual cuál: ambos terminan acá, ver ese componente). Pedido
 * explícito: NO una tarjeta embebida en el panel de gestión -- una nube flotante,
 * centrada en la pantalla, por encima de todo el contenido de la página. Reusa `Modal`
 * (portal a `document.body`, `z-50`, backdrop) en vez de reinventar ese mecanismo --
 * mismo componente que ya usa `ConfirmModal` en el resto de la Consola, así que se ve y
 * se comporta como cualquier otro diálogo de la app (Escape, click afuera, foco
 * atrapado) sin código nuevo para eso.
 *
 * Puramente informativo: un único botón, "Continuar", que solo cierra el aviso -- la
 * decisión de reincorporar el lote se toma aparte, desde el panel persistente "Lotes
 * desiertos" (`ConsolaDesiertoLotesPanel`), no desde acá. Separar "avisar" de "decidir"
 * evita forzar al rematador a resolver algo que puede dejar para más adelante, tal como
 * pide el enunciado.
 */
export function DesiertoLoteNotice({ lote, onClose }: DesiertoLoteNoticeProps) {
  return (
    <Modal isOpen={lote !== null} onClose={onClose} title={lote ? `Lote ${lote.lot_number} quedó desierto` : ''} footer={<Button onClick={onClose}>Continuar</Button>}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <PackageX aria-hidden="true" className="h-5 w-5" />
        </span>
        <p className="pt-1.5 text-sm text-slate-600">
          No recibió ninguna oferta válida. Podés incorporarlo de nuevo a la cola y ofrecerlo en una
          nueva ronda cuando quieras, desde &quot;Lotes desiertos&quot;.
        </p>
      </div>
    </Modal>
  );
}
