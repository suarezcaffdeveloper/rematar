/** Punto "en vivo" con pulso -- mismo lenguaje que el contador del dashboard anterior. */
export function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden="true">
      <span className="absolute inset-0 animate-ping rounded-full bg-success-400 opacity-75" />
      <span className="relative h-2 w-2 rounded-full bg-success-400" />
    </span>
  );
}
