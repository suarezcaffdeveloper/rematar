import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Sparkles } from 'lucide-react';
import { MockupWindow } from './MockupWindow';

interface Chapter {
  label: string;
  subtitle: string;
  start: number;
  end: number;
}

const CHAPTERS: Chapter[] = [
  { label: 'Vista general', subtitle: 'Consola del rematador en vivo', start: 0.0, end: 2.8 },
  { label: 'Chat en vivo', subtitle: 'Mensajes y participantes en tiempo real', start: 2.8, end: 6.8 },
  { label: 'Ofertas en tiempo real', subtitle: 'Comprador líder y ritmo de pujas', start: 6.8, end: 11.0 },
  { label: 'Botonera de control', subtitle: 'Gestión operativa del martillero', start: 11.0, end: 15.0 },
  { label: 'Ventas adjudicadas', subtitle: 'Seguimiento de cobro y entrega post-remate', start: 15.0, end: 22.8 },
  { label: 'Historial y métricas', subtitle: 'Resumen ejecutivo y resultados por lote', start: 22.8, end: 30.67 },
];

/**
 * Visual de la sección "Beneficios para rematadores" (`BenefitsSection`) -- video
 * interactivo de la consola y paneles del rematador con zooms cinemáticos y
 * subtítulos flotantes animados dentro de la pantalla del video.
 */
export function RematadorConsoleMockup() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30.67);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const currentChapter = CHAPTERS.find(
    (c) => currentTime >= c.start && currentTime < c.end,
  ) ?? CHAPTERS[0];

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <MockupWindow urlLabel="app.rematar.com/remates/consola" noPadding>
      <div
        className="group relative aspect-[16/10] w-full cursor-pointer overflow-hidden bg-slate-900"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/screenshots/consola-rematador.png"
          className="h-full w-full object-cover object-center"
        >
          <source src="/videos/consola-rematador-demo.mp4" type="video/mp4" />
          <source src="/videos/consola-rematador-demo.webm" type="video/webm" />
          Tu navegador no soporta video HTML5.
        </video>

        {/* Badge "Demo en vivo" superior */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger-500" />
          Demo en vivo
        </div>

        {/* Subtítulo dinámico flotante dentro de la pantalla del video */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
          <div
            key={currentChapter.label}
            className="flex items-center gap-2 rounded-xl bg-slate-950/85 px-3.5 py-2 text-white shadow-lg backdrop-blur-md animate-fade-in-subtitle"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-brand-400 animate-pulse" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-left">
              <span className="text-xs font-bold text-white tracking-wide">
                {currentChapter.label}
              </span>
              <span className="hidden sm:inline text-slate-500 text-xs">·</span>
              <span className="text-[11px] text-slate-300">
                {currentChapter.subtitle}
              </span>
            </div>
          </div>
        </div>

        {/* Play/Pause overlay indicator on hover or pause */}
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/20 transition-opacity duration-300 ${
            !isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg backdrop-blur transition-transform group-hover:scale-110">
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </div>
        </div>

        {/* Bottom Progress Bar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-slate-800/40">
          <div
            className="h-full bg-brand-500 transition-all duration-150"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </MockupWindow>
  );
}
