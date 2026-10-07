import { useState, type FormEvent, type ReactNode } from 'react';
import { Check, Copy, KeyRound, RefreshCcw } from 'lucide-react';
import { normalizeApiError } from '../../../../shared/api/errors';
import { Button } from '../../../../shared/components/Button';
import { ConfirmModal } from '../../../../shared/components/ConfirmModal';
import { Input } from '../../../../shared/components/Input';
import { useToastStore } from '../../../../shared/toast/toastStore';
import { clearRemateStreamRequest, generateOperatorCodeRequest, setRemateStreamRequest } from '../../../remates/api';
import type { Remate } from '../../../remates/types';
import { buildYouTubeEmbedUrl } from '../../../sala/components/StreamEmbed';
import { PrivateAccessCredentials } from '../PrivateAccessCredentials';
import { YouTubeMark } from '../YouTubeMark';
import { CollapsibleSection } from './CollapsibleSection';

export interface EquipoTabProps {
  remate: Remate;
  /** Código de operador recién generado. Vive en la Cabina (no acá) para que no se pierda al
   * cambiar de pestaña: el backend solo guarda su hash y no puede volver a mostrarlo. */
  operatorCode: string | null;
  onOperatorCodeChange: (code: string | null) => void;
  onRemateChange: () => void;
}

function CopyButton({ value, label, message }: { value: string; label: string; message: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      useToastStore.getState().push('success', message);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Portapapeles no disponible: el dato ya está visible en pantalla.
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copiar ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {copied ? <Check className="h-4 w-4 text-success-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function DataRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
      <dt className="col-span-2 text-sm text-ink-muted sm:col-span-1">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
      <dd>{action}</dd>
    </div>
  );
}

function KeyBadge() {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-warning-400 text-ink">
      <KeyRound className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );
}

function OperatorSection({ remate, code, onCodeChange }: { remate: Remate; code: string | null; onCodeChange: (code: string | null) => void }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // Con un código recién generado todavía nadie lo usó: el operador anterior ya fue desvinculado.
  const assigned = !code && Boolean(remate.rematador_id);

  async function generate() {
    setIsGenerating(true);
    try {
      const response = await generateOperatorCodeRequest(remate.id);
      onCodeChange(response.code);
      useToastStore.getState().push('success', 'Código de operador generado.');
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsGenerating(false);
    }
  }

  const status = assigned
    ? { tone: 'ok' as const, label: 'Martillero asignado' }
    : code
      ? { tone: 'ok' as const, label: 'Código listo' }
      : { tone: 'warn' as const, label: 'Falta generar' };

  return (
    <CollapsibleSection
      title="Datos para el martillero"
      hint="Con el ID del remate y el código, el martillero entra a operar desde “Unirme como operador”."
      defaultOpen={!assigned}
      leading={<KeyBadge />}
      status={status}
    >
      <dl className="border-t border-line">
        <DataRow label="ID del remate" action={<CopyButton value={remate.id} label="ID del remate" message="ID del remate copiado." />}>
          <code className="text-[15px] font-semibold text-ink">{remate.id}</code>
        </DataRow>
        <DataRow
          label="Código de acceso"
          action={code ? <CopyButton value={code} label="Código de acceso" message="Código copiado." /> : undefined}
        >
          {code ? (
            <code className="text-lg font-semibold tracking-wider text-ink">{code}</code>
          ) : assigned ? (
            <span className="text-sm text-ink-muted">Ya fue usado por el martillero asignado.</span>
          ) : (
            <span className="text-sm text-ink-faint">Todavía sin generar</span>
          )}
        </DataRow>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" isLoading={isGenerating} onClick={() => (remate.rematador_id && !code ? setConfirmRegenerate(true) : void generate())}>
          <RefreshCcw aria-hidden="true" className="h-4 w-4" />
          {code || assigned ? 'Generar un código nuevo' : 'Generar código'}
        </Button>
        {code && (
          <CopyButton
            value={`ID del remate: ${remate.id}\nCódigo de acceso: ${code}`}
            label="ID y código"
            message="ID y código copiados."
          />
        )}
      </div>
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">
        {code
          ? 'Copialo ahora: el código se muestra una sola vez y no se puede volver a ver al salir de esta pantalla.'
          : 'Por seguridad el código se muestra una sola vez al generarlo. Si lo perdés, generá uno nuevo: el anterior deja de servir.'}
      </p>

      <ConfirmModal
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => {
          setConfirmRegenerate(false);
          void generate();
        }}
        variant="danger"
        title="Generar un código nuevo"
        message="Ya hay un martillero asignado. Un código nuevo lo desvincula de este remate de inmediato: vas a tener que darle el código nuevo para que vuelva a entrar."
        confirmLabel="Generar de todos modos"
      />
    </CollapsibleSection>
  );
}

function StreamSection({ remate, onChange }: { remate: Remate; onChange: () => void }) {
  const [url, setUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const videoId = remate.stream_video_id ?? null;
  const previewSrc = videoId ? buildYouTubeEmbedUrl(videoId) : null;

  async function run(action: () => Promise<Remate>, message: string) {
    setIsSaving(true);
    setError(undefined);
    try {
      await action();
      onChange();
      setUrl('');
      useToastStore.getState().push('success', message);
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Pegá el link de tu transmisión de YouTube.');
      return;
    }
    void run(() => setRemateStreamRequest(remate.id, trimmed), 'Transmisión publicada en la Sala.');
  }

  return (
    <CollapsibleSection
      title="Transmisión en vivo"
      hint="Los compradores ven el video de YouTube dentro de la Sala. Podés cambiarlo o quitarlo cuando quieras."
      defaultOpen={!videoId}
      leading={<YouTubeMark size={36} className="mt-0.5 !rounded-[9px]" />}
      status={videoId ? { tone: 'ok', label: 'Publicada' } : { tone: 'warn', label: 'Sin transmisión' }}
    >
      <div className="grid gap-x-10 gap-y-6 border-t border-line pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label={videoId ? 'Cambiar el link de YouTube' : 'Link de YouTube'}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            error={error}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" isLoading={isSaving}>
              {videoId ? 'Actualizar' : 'Publicar'}
            </Button>
            {videoId && (
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => void run(() => clearRemateStreamRequest(remate.id), 'Transmisión quitada.')}>
                Quitar transmisión
              </Button>
            )}
          </div>
          <p className="max-w-xl text-sm text-ink-muted">
            Iniciá tu transmisión en YouTube, copiá el link del video en vivo y pegalo acá.
            {remate.access_type === 'private' && ' Como este remate es privado, transmití en modo “No listado”.'}
          </p>
        </form>

        {previewSrc && (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-ink">
            <iframe
              src={previewSrc}
              title="Vista previa de la transmisión"
              className="absolute inset-0 h-full w-full"
              allow="encrypted-media; picture-in-picture"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

/**
 * Pestaña "Equipo y accesos" de la Cabina: dos apartados plegables, uno debajo del otro --
 * datos para el martillero arriba y transmisión en vivo abajo (más el acceso privado, solo
 * si el remate es privado). Cada uno muestra en el título si ya está listo.
 */
export function EquipoTab({ remate, operatorCode, onOperatorCodeChange, onRemateChange }: EquipoTabProps) {
  return (
    <div className="flex flex-col">
      <OperatorSection remate={remate} code={operatorCode} onCodeChange={onOperatorCodeChange} />
      <StreamSection remate={remate} onChange={onRemateChange} />
      {remate.access_type === 'private' && (
        <CollapsibleSection
          title="Acceso privado"
          hint="El link y el código que necesitan los compradores para entrar a este remate."
          defaultOpen={false}
        >
          <div className="border-t border-line pt-6">
            <PrivateAccessCredentials remate={remate} />
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
