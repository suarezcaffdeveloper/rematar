import { useState } from 'react';
import { Check, Copy, KeyRound, RefreshCcw } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useToastStore } from '../../../shared/toast/toastStore';
import { generateOperatorCodeRequest } from '../../remates/api';
import type { Remate } from '../../remates/types';

export interface OperatorCodePanelProps {
  remate: Remate;
}

interface InlineCopyFieldProps {
  label: string;
  value: string;
  successMessage: string;
}

/** Un dato copiable inline -- ID de remate y código de operador comparten la misma
 * interacción (copiar al portapapeles, ícono que confirma un instante), así que se
 * resuelve una sola vez acá en vez de duplicar el manejo de estado. */
function InlineCopyField({ label, value, successMessage }: InlineCopyFieldProps) {
  const [justCopied, setJustCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setJustCopied(true);
      useToastStore.getState().push('success', successMessage);
      window.setTimeout(() => setJustCopied(false), 2000);
    } catch {
      // Portapapeles no disponible (ej. contexto sin permisos) -- el dato ya está
      // visible en pantalla, copiarlo a mano sigue siendo posible.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <code className="rounded-md border border-line bg-surface-subtle px-2 py-0.5 text-[13px] font-semibold text-ink">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="rounded p-1 text-ink-faint transition-colors hover:text-ink-muted"
      >
        {justCopied ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-600" />
        ) : (
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

/**
 * Franja "Datos para el rematador" (ADR-048), visible solo para la empresa dueña del
 * remate -- pensada para ser lo primero que ve al entrar a gestionarlo (ver
 * `ConsolaOperativaPage`, se renderiza antes que cualquier otra cosa, incluso mientras
 * el remate todavía no está en vivo): reúne los dos datos que el rematador necesita para
 * poder entrar a operar (`OperatorClaimPage`, "Unirme como operador") -- el ID del
 * remate (siempre visible, no es secreto) y el código de operador de un solo hash que
 * hay que generar (`POST /remates/{id}/generate-operator-code`). Antes el ID no se
 * mostraba en ningún lado de la Consola Operativa -- la única forma de conseguirlo era
 * copiarlo de la URL, y encima el código vivía en un panel angosto al final de la
 * página, lejos de donde la empresa mira primero.
 *
 * Retexturizada a una franja fina con separador (`border-b border-line`), sin card ni
 * fondo de color -- mismo criterio "sin card, solo un separador" que ya usan
 * `ConsolaHeader` y `ConsolaLotePanel` en esta misma página; la card punteada original
 * ocupaba ~230px siempre expandida y competía visualmente con el título del remate
 * justo debajo.
 *
 * El código se muestra en texto plano una única vez (`generateOperatorCodeRequest`, el
 * backend nunca lo persiste así) -- si se pierde, la única opción es regenerarlo, lo
 * que además revoca al operador ya asignado (confirmación explícita antes de hacerlo si
 * ya había uno, para no cortarle el acceso a alguien en medio de un remate en vivo por
 * accidente).
 */
export function OperatorCodePanel({ remate }: OperatorCodePanelProps) {
  const [rematadorId, setRematadorId] = useState(remate.rematador_id ?? null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  async function generate() {
    setIsGenerating(true);
    try {
      const response = await generateOperatorCodeRequest(remate.id);
      setLastCode(response.code);
      setRematadorId(null);
      useToastStore.getState().push('success', 'Código de operador generado.');
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleGenerateClick() {
    if (rematadorId) {
      setConfirmRegenerate(true);
      return;
    }
    void generate();
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-line pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden="true" className="h-3.5 w-3.5 text-brand-600" />
          <span className="text-xs font-semibold text-ink-muted">Datos para el rematador</span>
        </div>
        {rematadorId && <Badge variant="success">Operador asignado</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
        <InlineCopyField label="ID del remate" value={remate.id} successMessage="ID del remate copiado." />

        <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />

        {lastCode ? (
          <InlineCopyField label="Código de operador" value={lastCode} successMessage="Código copiado." />
        ) : (
          <span className="text-sm italic text-ink-faint">
            {rematadorId
              ? 'Ya hay un rematador asignado -- regenerá el código para reasignarlo a otra persona.'
              : 'Todavía no generaste un código de operador.'}
          </span>
        )}

        <Button
          variant="ghost"
          className="ml-auto !gap-1.5 !px-2 !py-1 text-xs"
          onClick={handleGenerateClick}
          isLoading={isGenerating}
        >
          <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
          {rematadorId || lastCode ? 'Regenerar código' : 'Generar código'}
        </Button>
      </div>

      {lastCode && (
        <p className="text-xs text-ink-faint">
          El código no se va a volver a mostrar una vez que salgas de esta pantalla --
          copialo ahora.
        </p>
      )}

      <ConfirmModal
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => {
          setConfirmRegenerate(false);
          void generate();
        }}
        variant="danger"
        title="Regenerar código de operador"
        message="Ya hay un rematador asignado. Regenerar el código lo desvincula de este remate de inmediato -- vas a tener que darle el código nuevo para que vuelva a entrar."
        confirmLabel="Regenerar de todos modos"
      />
    </div>
  );
}
