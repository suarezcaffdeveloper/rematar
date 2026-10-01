// Mismo formato que valida el backend (`remates/stream.py`). Se re-chequea acá aunque el
// dato ya venga validado: el `src` del iframe nunca se arma con nada que no pase esto.
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function buildYouTubeEmbedUrl(videoId: string): string | null {
  if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`;
}

export interface StreamEmbedProps {
  provider: string | null | undefined;
  videoId: string | null | undefined;
  /** Título accesible del iframe (título del remate). */
  title: string;
}

/**
 * Transmisión en vivo embebida de la Sala de un remate en vivo (YouTube). Va fija sobre el
 * lote actual, con el mismo tamaño (`aspect-video`) que la imagen principal del lote. No
 * renderiza nada si no hay transmisión cargada o si el ID no es válido. Avisa que el video
 * tiene retraso: las ofertas y el cronómetro del sistema son la fuente de verdad.
 */
export function StreamEmbed({ provider, videoId, title }: StreamEmbedProps) {
  if (provider !== 'youtube' || !videoId) return null;
  const src = buildYouTubeEmbedUrl(videoId);
  if (!src) return null;

  return (
    <section aria-label="Transmisión en vivo" className="flex flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={src}
          title={`Transmisión en vivo: ${title}`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
      <p className="text-xs text-ink-faint">
        El video puede tener unos segundos de retraso. Las ofertas y el cronómetro del sistema son los que
        valen.
      </p>
    </section>
  );
}
