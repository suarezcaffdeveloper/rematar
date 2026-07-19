export interface ProgressBarProps {
  /** 0-100. */
  percent: number;
  label?: string;
}

/** Barra de progreso genérica -- sin ningún conocimiento de qué se está subiendo. */
export function ProgressBar({ percent, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-slate-500">{label}</span>}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
