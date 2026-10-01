import { useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, Gavel, KeyRound, RefreshCcw, X } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useToastStore } from '../../../shared/toast/toastStore';
import { generateOperatorCodeRequest } from '../../remates/api';
import type { Remate } from '../../remates/types';

export interface OperatorCodePanelProps {
  remate: Remate;
  /** 'card' (default): franja horizontal de siempre, con su propio fondo/borde de marca
   * -- la usan los estados no operativos (`ConsolaOperativaPage`, remate todavía en
   * borrador/programado). 'popover': layout vertical angosto, sin fondo/borde propio --
   * pensado para vivir DENTRO del globito naranja que abre `ConsolaQuickPanels`
   * (Consola en vivo/pausada), que ya pone el marco, la sombra y la puntita. */
  variant?: 'card' | 'popover';
  /** Solo con `variant="popover"`: cierra el globito (la X del encabezado). */
  onClose?: () => void;
}

interface InlineCopyFieldProps {
  label: string;
  value: string;
  successMessage: string;
  /** Borde del campo -- `border-brand-200` en la franja de siempre, neutro en el
   * globito naranja (el color del globito ya lo lleva el encabezado, no hace falta
   * repetirlo en cada campo). */
  toneClassName: string;
}

/** Un dato copiable inline -- ID de remate y código de acceso comparten la misma
 * interacción (copiar al portapapeles, ícono que confirma un instante), así que se
 * resuelve una sola vez acá en vez de duplicar el manejo de estado. */
function InlineCopyField({ label, value, successMessage, toneClassName }: InlineCopyFieldProps) {
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
    <div className={clsx('flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5', toneClassName)}>
      <span className="shrink-0 text-[11px] font-semibold text-ink-faint">{label}</span>
      <code className="truncate text-[13px] font-semibold text-ink">{value}</code>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="ml-auto shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-slate-100 hover:text-ink-muted"
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

/** Mismo tamaño/forma que `InlineCopyField`, para el momento en que todavía no hay
 * código generado -- reserva el espacio en la franja en vez de dejarlo saltar de ancho
 * apenas se genera uno. */
function EmptyCodeField() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5">
      <span className="text-[11px] font-semibold text-ink-faint">Código de acceso</span>
      <span className="text-xs italic text-ink-faint">Sin generar</span>
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
 * Rediseñada a una franja fina con fondo/borde de marca (`bg-brand-50 border-brand-200`,
 * una sola línea de alto en vez de las ~230px de la card punteada original) -- pedido
 * explícito: que se note que es una acción pendiente de la empresa, sin volver a la
 * altura de la card vieja. El campo del código reserva su lugar aunque todavía no se
 * generó ninguno (`EmptyCodeField`), para que generar uno no corra el resto de la franja
 * de ancho. `handleCopyBoth` junta ambos datos en un solo texto ("ID del remate: ...\n
 * Código de acceso: ...") -- antes la empresa tenía que copiar el ID y el código por
 * separado para pasárselos al rematador.
 *
 * El código se muestra en texto plano una única vez (`generateOperatorCodeRequest`, el
 * backend nunca lo persiste así) -- si se pierde, la única opción es regenerarlo, lo
 * que además revoca al operador ya asignado (confirmación explícita antes de hacerlo si
 * ya había uno, para no cortarle el acceso a alguien en medio de un remate en vivo por
 * accidente).
 *
 * `variant="popover"` (diseño aprobado, Consola en vivo/pausada): mismo componente,
 * mismos handlers/estado -- solo cambia el marco visual, de la franja horizontal de
 * siempre a un layout vertical angosto (badge/label/campos apilados) sin fondo/borde
 * propio, para vivir dentro del globito naranja de `ConsolaQuickPanels`.
 */
export function OperatorCodePanel({ remate, variant = 'card', onClose }: OperatorCodePanelProps) {
  const [rematadorId, setRematadorId] = useState(remate.rematador_id ?? null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [justCopiedBoth, setJustCopiedBoth] = useState(false);

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

  /** Copia ambos datos juntos, uno debajo del otro, listos para pegar tal cual en un
   * chat con el rematador -- en vez de que la empresa tenga que copiar y pegar el ID y
   * el código por separado. */
  async function handleCopyBoth() {
    if (!lastCode) return;
    const combined = `ID del remate: ${remate.id}\nCódigo de acceso: ${lastCode}`;
    try {
      await navigator.clipboard.writeText(combined);
      setJustCopiedBoth(true);
      useToastStore.getState().push('success', 'ID y código copiados.');
      window.setTimeout(() => setJustCopiedBoth(false), 2000);
    } catch {
      // Portapapeles no disponible -- los datos ya están visibles en pantalla.
    }
  }

  const isPopover = variant === 'popover';
  const fieldTone = isPopover ? 'border-line' : 'border-brand-200';

  const statusBadge =
    rematadorId ? (
      <Badge variant="success">Operador asignado</Badge>
    ) : lastCode ? (
      <Badge variant="brand">Código listo</Badge>
    ) : (
      <Badge variant="warning">Falta generar</Badge>
    );

  const generateButton = (
    <Button
      variant={isPopover ? 'warning-outline' : 'ink-outline'}
      className={isPopover ? 'flex-1 !gap-1.5 !px-2.5 !py-1.5 text-xs' : '!gap-1.5 !px-2.5 !py-1.5 text-xs'}
      onClick={handleGenerateClick}
      isLoading={isGenerating}
    >
      <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
      {rematadorId || lastCode ? 'Regenerar código' : 'Generar código'}
    </Button>
  );

  const copyBothButton = (
    <Button
      variant={isPopover ? 'warning' : 'primary'}
      className={isPopover ? 'flex-1 !gap-1.5 !px-2.5 !py-1.5 text-xs' : '!gap-1.5 !px-2.5 !py-1.5 text-xs'}
      onClick={() => void handleCopyBoth()}
      disabled={!lastCode}
    >
      {justCopiedBoth ? (
        <>
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
          ¡Copiado!
        </>
      ) : (
        <>
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          Copiar datos
        </>
      )}
    </Button>
  );

  const confirmModal = (
    <ConfirmModal
      isOpen={confirmRegenerate}
      onClose={() => setConfirmRegenerate(false)}
      onConfirm={() => {
        setConfirmRegenerate(false);
        void generate();
      }}
      variant="danger"
      title="Regenerar código de operador"
      message="Ya hay un martillero asignado. Regenerar el código lo desvincula de este remate de inmediato -- vas a tener que darle el código nuevo para que vuelva a entrar."
      confirmLabel="Regenerar de todos modos"
    />
  );

  if (isPopover) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-warning-100">
              <Gavel aria-hidden="true" className="h-3.5 w-3.5 text-warning-800" strokeWidth={2.2} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Datos para el martillero</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar datos para el martillero"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-warning-50 hover:text-warning-700"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {statusBadge}

        <div className="flex flex-col gap-2">
          <InlineCopyField
            label="ID del remate"
            value={remate.id}
            successMessage="ID del remate copiado."
            toneClassName={fieldTone}
          />
          {lastCode ? (
            <InlineCopyField
              label="Código de acceso"
              value={lastCode}
              successMessage="Código copiado."
              toneClassName={fieldTone}
            />
          ) : (
            <EmptyCodeField />
          )}
        </div>

        <div className="flex gap-2">
          {generateButton}
          {copyBothButton}
        </div>

        {lastCode && (
          <p className="text-xs text-ink-faint">
            El código no se va a volver a mostrar una vez que salgas de esta pantalla -- copialo ahora.
          </p>
        )}

        {confirmModal}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <KeyRound aria-hidden="true" className="h-4 w-4" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Datos para el martillero</span>
      </div>

      {statusBadge}

      <span aria-hidden="true" className="h-7 w-px shrink-0 bg-brand-200" />

      <InlineCopyField label="ID del remate" value={remate.id} successMessage="ID del remate copiado." toneClassName={fieldTone} />

      {lastCode ? (
        <InlineCopyField label="Código de acceso" value={lastCode} successMessage="Código copiado." toneClassName={fieldTone} />
      ) : (
        <EmptyCodeField />
      )}

      <div className="ml-auto flex items-center gap-2">
        {generateButton}
        {copyBothButton}
      </div>

      {lastCode && (
        <p className="w-full text-xs text-ink-faint">
          El código no se va a volver a mostrar una vez que salgas de esta pantalla --
          copialo ahora.
        </p>
      )}

      {confirmModal}
    </div>
  );
}
