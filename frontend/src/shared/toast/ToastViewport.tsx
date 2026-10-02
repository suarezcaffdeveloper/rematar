import { useEffect, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { useToastStore, type ToastVariant } from './toastStore';

const AUTO_DISMISS_MS = 5000;
const EXIT_DURATION_MS = 150;

const VARIANT_ICONS: Record<ToastVariant, typeof Info> = {
  error: XCircle,
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
};

const TONES: Record<ToastVariant, { chip: string; bar: string; border: string }> = {
  success: { chip: 'bg-success-100 text-success-700', bar: 'bg-success-500', border: 'border-success-200' },
  error: { chip: 'bg-danger-100 text-danger-700', bar: 'bg-danger-500', border: 'border-danger-200' },
  warning: { chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', border: 'border-amber-200' },
  info: { chip: 'bg-brand-100 text-brand-700', bar: 'bg-brand-500', border: 'border-brand-200' },
};

function ToastItem({ id, variant, message }: { id: string; variant: ToastVariant; message: string }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const Icon = VARIANT_ICONS[variant];

  function handleDismiss() {
    setIsLeaving(true);
    window.setTimeout(() => dismiss(id), EXIT_DURATION_MS);
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(handleDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div
      className={clsx(
        'transition-all duration-150 ease-out',
        isVisible && !isLeaving ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
      )}
    >
      <div
        className={clsx(
          'relative overflow-hidden rounded-2xl border bg-white shadow-[0_18px_40px_-12px_rgba(16,17,20,0.28)]',
          TONES[variant].border,
        )}
      >
        <div className="flex items-center gap-3 py-3 pl-3.5 pr-2.5">
          <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONES[variant].chip)}>
            <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          <p className="flex-1 text-sm font-semibold leading-snug text-ink">{message}</p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Cerrar aviso"
            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <span
          aria-hidden="true"
          className={clsx('toast-progress absolute inset-x-0 bottom-0 h-[3px] origin-left', TONES[variant].bar)}
          style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        />
      </div>
    </div>
  );
}

/**
 * Se monta una única vez, en `RootLayout` -- todo el resto de la app le habla a
 * través de `useToastStore.getState().push(...)`, nunca renderizando un toast
 * localmente. El contenedor externo queda siempre montado (con `aria-live="polite"`)
 * aunque no haya toasts -- mutar el contenido de una región ya presente en el DOM es
 * más confiable para lectores de pantalla que montar de cero un nodo con `role="status"`
 * cada vez (gap de accesibilidad corregido en el rediseño, Épica 9, Etapa 1).
 */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem {...toast} />
        </div>
      ))}
    </div>
  );
}
