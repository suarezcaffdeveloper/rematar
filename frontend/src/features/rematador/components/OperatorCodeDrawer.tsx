import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, CircleDashed, Copy, KeyRound, X } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import { useToastStore } from '../../../shared/toast/toastStore';
import { formatDateTime } from '../../../shared/lib/format';
import { generateOperatorCodeRequest } from '../../remates/api';
import type { Remate } from '../../remates/types';
import { describeTimeUntil } from '../dashboard';
import { useRemateOperationalInfo } from '../hooks';

export interface OperatorCodeDrawerProps {
  remate: Remate;
  isOpen: boolean;
  onClose: () => void;
  /** Se llama tras generar un código, para que el dashboard recargue la lista (generar
   * desvincula al operador anterior y cambia la fecha de generación). */
  onGenerated?: () => void;
}

const STEPS = [
  { title: 'Generá el código', text: 'Es de un solo uso por vez: generar uno nuevo invalida el anterior.' },
  { title: 'Pasáselo al martillero', text: 'Mandale el ID del remate y el código por el canal que prefieras.' },
  { title: 'El martillero lo canjea', text: 'Desde su cuenta de rematador, en "Unirme como operador".' },
];

async function copyText(text: string, successMessage: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    useToastStore.getState().push('success', successMessage);
    return true;
  } catch {
    // Portapapeles no disponible -- el dato sigue visible en pantalla.
    return false;
  }
}

function CopyRow({ label, value, successMessage, mono }: { label: string; value: string; successMessage: string; mono?: boolean }) {
  const [justCopied, setJustCopied] = useState(false);
  async function handleCopy() {
    if (await copyText(value, successMessage)) {
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 2000);
    }
  }
  return (
    <div className="flex items-center gap-3 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
        <code className={`mt-0.5 block truncate text-ink ${mono ? 'text-xl font-semibold tracking-widest' : 'text-sm'}`}>{value}</code>
      </div>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {justCopied ? <Check aria-hidden="true" className="h-4 w-4 text-success-600" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
        {justCopied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function ChecklistItem({ done, children, to, linkLabel }: { done: boolean; children: ReactNode; to?: string; linkLabel?: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3">
      {done ? (
        <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-success-600" />
      ) : (
        <CircleDashed aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-faint" />
      )}
      <span className="flex-1 text-sm">{children}</span>
      {!done && to && linkLabel && (
        <Link to={to} className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">
          {linkLabel}
        </Link>
      )}
    </li>
  );
}

function DrawerBody({ remate, onGenerated }: Pick<OperatorCodeDrawerProps, 'remate' | 'onGenerated'>) {
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [rematadorId, setRematadorId] = useState(remate.rematador_id ?? null);
  const [generatedAt, setGeneratedAt] = useState(remate.operator_code_generated_at ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [justCopiedBoth, setJustCopiedBoth] = useState(false);
  const { loteCount } = useRemateOperationalInfo(remate.id, remate.status);

  async function generate() {
    setIsGenerating(true);
    try {
      const response = await generateOperatorCodeRequest(remate.id);
      setLastCode(response.code);
      setRematadorId(null);
      setGeneratedAt(response.generated_at ?? new Date().toISOString());
      useToastStore.getState().push('success', 'Código de operador generado.');
      onGenerated?.();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopyBoth() {
    if (!lastCode) return;
    if (await copyText(`ID del remate: ${remate.id}\nCódigo de acceso: ${lastCode}`, 'ID y código copiados.')) {
      setJustCopiedBoth(true);
      window.setTimeout(() => setJustCopiedBoth(false), 2000);
    }
  }

  const hasGenerated = Boolean(generatedAt);
  const statusLabel = rematadorId ? 'Operador asignado' : hasGenerated ? 'Código listo' : 'Sin generar';
  const statusTone = rematadorId ? 'text-success-700' : hasGenerated ? 'text-brand-700' : 'text-warning-700';
  const now = Date.now();

  return (
    <div data-drawer-body className="flex-1 overflow-y-auto px-4 pb-8 sm:px-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
        <span className={`font-semibold ${statusTone}`}>{statusLabel}</span>
        {remate.starts_at && (
          <span>
            {formatDateTime(remate.starts_at)} · empieza {describeTimeUntil(remate.starts_at, now)}
          </span>
        )}
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-700">Paso {index + 1}</span>
            <p className="mt-1 font-semibold tracking-tight">{step.title}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{step.text}</p>
          </li>
        ))}
      </ol>

      <section aria-label="Datos para el martillero" className="mt-8">
        <h3 className="border-b border-ink pb-2 text-lg font-semibold tracking-tight">Datos para el martillero</h3>
        <CopyRow label="ID del remate" value={remate.id} successMessage="ID del remate copiado." />
        {lastCode ? (
          <CopyRow label="Código de acceso" value={lastCode} successMessage="Código copiado." mono />
        ) : (
          <div className="border-b border-line py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Código de acceso</p>
            <p className="mt-0.5 text-sm italic text-ink-faint">
              {hasGenerated ? 'Ya se generó uno, pero no se puede volver a mostrar. Generá uno nuevo si lo perdiste.' : 'Todavía no generaste ninguno.'}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => (rematadorId ? setConfirmRegenerate(true) : void generate())}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
              lastCode || hasGenerated
                ? 'border border-line-strong bg-white text-ink hover:border-ink'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {isGenerating ? 'Generando…' : lastCode || hasGenerated ? 'Generar código nuevo' : 'Generar código'}
          </button>
          {lastCode && (
            <button
              type="button"
              onClick={() => void handleCopyBoth()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {justCopiedBoth ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {justCopiedBoth ? 'Copiado' : 'Copiar datos para enviar'}
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {lastCode
            ? 'Copialo ahora: el código se muestra una sola vez y no se puede recuperar al cerrar este panel.'
            : generatedAt
              ? `Último código generado ${describeTimeUntil(generatedAt, now)}.`
              : 'Al generarlo, el código se muestra una sola vez.'}
        </p>
      </section>

      <section aria-label="Preparación del remate" className="mt-8">
        <h3 className="border-b border-ink pb-2 text-lg font-semibold tracking-tight">Antes de que empiece</h3>
        <ul>
          <ChecklistItem done={Boolean(rematadorId)}>Rematador operador asignado</ChecklistItem>
          <ChecklistItem done={(loteCount ?? 0) > 0} to={`/remates/${remate.id}/lotes`} linkLabel="Cargar lotes">
            {loteCount === null ? 'Lotes cargados' : loteCount > 0 ? `${loteCount} ${loteCount === 1 ? 'lote cargado' : 'lotes cargados'}` : 'Sin lotes cargados'}
          </ChecklistItem>
          <ChecklistItem done={Boolean(remate.stream_video_id)} to={`/remates/${remate.id}/gestionar`} linkLabel="Cargar transmisión">
            {remate.stream_video_id ? 'Transmisión de YouTube cargada' : 'Transmisión de YouTube (opcional)'}
          </ChecklistItem>
        </ul>
      </section>

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
    </div>
  );
}

/**
 * Panel lateral "Código para el martillero": reemplaza al `OperatorCodePanel` en formato
 * franja que vivía en la pantalla de gestión antes de que arranque el remate. Se abre
 * desde el dashboard (aviso "Asigná un rematador operador" o la tarjeta del remate) para
 * que generar y copiar el código no obligue a cambiar de pantalla. El cuerpo se monta
 * solo mientras está abierto: cerrarlo descarta el código en texto plano de la memoria.
 */
export function OperatorCodeDrawer({ remate, isOpen, onClose, onGenerated }: OperatorCodeDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[45]">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Código para el martillero"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[40rem] flex-col bg-white font-display text-ink shadow-[-30px_0_80px_-30px_rgba(16,17,20,0.5)] focus:outline-none"
        initial={prefersReducedMotion ? false : { x: 48, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="flex items-start justify-between gap-4 px-4 pb-4 pt-5 sm:px-7">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              Código para el martillero
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{remate.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <DrawerBody remate={remate} onGenerated={onGenerated} />
      </motion.div>
    </div>,
    document.body,
  );
}
