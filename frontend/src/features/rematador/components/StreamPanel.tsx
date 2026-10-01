import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Video, X } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { useToastStore } from '../../../shared/toast/toastStore';
import { clearRemateStreamRequest, setRemateStreamRequest } from '../../remates/api';
import type { Remate } from '../../remates/types';
import { buildYouTubeEmbedUrl } from '../../sala/components/StreamEmbed';
import { YouTubeMark } from './YouTubeMark';

export interface StreamPanelProps {
  remate: Remate;
  /** Se llama con el remate actualizado tras guardar/quitar. Opcional: en la Sala/consola
   * el cambio también llega por el evento en tiempo real `remate.stream_updated`. */
  onChange?: (remate: Remate) => void;
  /** 'card' (default): franja completa de siempre, con su propio fondo/borde de marca --
   * la usan los estados no operativos (`ConsolaOperativaPage`, remate todavía en
   * borrador/programado, sin sidebar de chat/ofertas a la que anclar un globito).
   * 'popover': solo el contenido, sin fondo/borde propio ni ancho máximo en la vista
   * previa -- pensado para vivir DENTRO del globito rojo que abre `ConsolaQuickPanels`
   * (Consola en vivo/pausada), que ya pone el marco, la sombra y la puntita. */
  variant?: 'card' | 'popover';
  /** Solo con `variant="popover"`: cierra el globito (la X del encabezado). */
  onClose?: () => void;
}

/**
 * Franja "Transmisión en vivo" de la consola: la empresa (o el rematador asignado) pega el
 * link de la transmisión de YouTube cuando ya la tiene -- normalmente con el remate en
 * curso -- y los compradores la ven embebida en la Sala. El backend valida el link y
 * guarda solo el ID del video.
 */
export function StreamPanel({ remate, onChange, variant = 'card', onClose }: StreamPanelProps) {
  const [url, setUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const currentVideoId = remate.stream_video_id ?? null;
  const previewSrc = currentVideoId ? buildYouTubeEmbedUrl(currentVideoId) : null;

  async function run(action: () => Promise<Remate>, successMessage: string) {
    setIsSaving(true);
    setError(undefined);
    try {
      const updated = await action();
      onChange?.(updated);
      setUrl('');
      useToastStore.getState().push('success', successMessage);
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

  const isPopover = variant === 'popover';

  return (
    <div
      className={
        isPopover ? 'flex flex-col gap-3' : 'flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3'
      }
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          {isPopover ? (
            <YouTubeMark size={24} />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Video aria-hidden="true" className="h-4 w-4" />
            </div>
          )}
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Transmisión en vivo
          </span>
          {currentVideoId && (
            <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
              Publicada
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar transmisión en vivo"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-danger-50 hover:text-danger-600"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className={isPopover ? 'flex flex-col gap-2' : 'flex flex-wrap items-start gap-2'} noValidate>
        <div className={isPopover ? 'w-full' : 'min-w-[16rem] flex-1'}>
          <Input
            label={currentVideoId ? 'Cambiar link de YouTube' : 'Link de YouTube'}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            error={error}
          />
        </div>
        <div className={isPopover ? 'flex w-full gap-2' : 'flex gap-2 pt-6'}>
          <Button
            type="submit"
            variant={isPopover ? 'danger' : 'primary'}
            isLoading={isSaving}
            className={isPopover ? 'flex-1' : undefined}
          >
            {currentVideoId ? 'Actualizar' : 'Publicar'}
          </Button>
          {currentVideoId && (
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={() => void run(() => clearRemateStreamRequest(remate.id), 'Transmisión quitada.')}
            >
              Quitar
            </Button>
          )}
        </div>
      </form>

      <p className="text-xs text-ink-muted">
        Iniciá tu transmisión en YouTube, copiá el link del video en vivo y pegalo acá. Podés cambiarlo o
        quitarlo en cualquier momento.
        {remate.access_type === 'private' &&
          ' Como este remate es privado, transmití en modo “No listado” en YouTube.'}
      </p>

      {previewSrc && (
        <div className={clsx('relative aspect-video w-full overflow-hidden rounded-lg bg-black', !isPopover && 'max-w-sm')}>
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
  );
}
