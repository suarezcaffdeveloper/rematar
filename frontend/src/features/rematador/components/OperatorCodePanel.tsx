import { type ReactNode, useState } from 'react';
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

interface CopyFieldProps {
  label: string;
  value: string;
  successMessage: string;
  monospace?: boolean;
}

/** Un dato copiable con su propio botón -- ID de remate y código de operador comparten
 * la misma interacción (copiar al portapapeles, ícono que confirma un instante), así
 * que se resuelve una sola vez acá en vez de duplicar el manejo de estado. */
function CopyField({ label, value, successMessage, monospace }: CopyFieldProps) {
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
    <div className="flex flex-col gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <code className={monospace ? 'truncate text-lg font-bold tracking-widest text-brand-700' : 'truncate text-sm font-semibold text-ink'}>
          {value}
        </code>
        <Button
          variant="ghost"
          className="!shrink-0 !gap-1.5 !px-2 !py-1 text-xs"
          onClick={() => void handleCopy()}
        >
          {justCopied ? (
            <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-600" />
          ) : (
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {justCopied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}

function EmptyCopyField({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center rounded-lg border border-dashed border-brand-300 bg-white/60 px-3 py-2.5 text-sm text-ink-faint">
      {children}
    </div>
  );
}

/**
 * Tarjeta "Datos para el rematador" (ADR-048), visible solo para la empresa dueña del
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
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/60 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-700">
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            Datos para el rematador
          </h2>
          <p className="mt-1 max-w-md text-sm text-ink-muted">
            Compartí estos dos datos con la persona que va a operar este remate en vivo --
            los va a necesitar para entrar en "Unirme como operador".
          </p>
        </div>
        {rematadorId && <Badge variant="success">Operador asignado</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CopyField label="ID del remate" value={remate.id} successMessage="ID del remate copiado." />

        {lastCode ? (
          <CopyField
            label="Código de operador"
            value={lastCode}
            successMessage="Código copiado."
            monospace
          />
        ) : (
          <EmptyCopyField>
            {rematadorId
              ? 'Ya hay un rematador asignado -- regenerá el código para reasignarlo a otra persona.'
              : 'Todavía no generaste un código de operador.'}
          </EmptyCopyField>
        )}
      </div>

      {lastCode && (
        <p className="text-xs text-ink-faint">
          El código no se va a volver a mostrar una vez que salgas de esta pantalla --
          copialo ahora.
        </p>
      )}

      <Button
        variant="secondary"
        className="w-fit !gap-1.5"
        onClick={handleGenerateClick}
        isLoading={isGenerating}
      >
        <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
        {rematadorId || lastCode ? 'Regenerar código' : 'Generar código'}
      </Button>

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
