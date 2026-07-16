import clsx from 'clsx';

const SIZE_CLASSES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  /** Texto para lectores de pantalla -- el spinner en sí es puramente visual. */
  label?: string;
}

export function Spinner({ size = 'md', className, label = 'Cargando…' }: SpinnerProps) {
  return (
    <span
      role="status"
      className={clsx(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        SIZE_CLASSES[size],
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
