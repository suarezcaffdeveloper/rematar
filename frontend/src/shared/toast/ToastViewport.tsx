import { useEffect, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { useToastStore, type ToastVariant } from './toastStore';
import { Alert } from '../components/Alert';

const AUTO_DISMISS_MS = 5000;
const EXIT_DURATION_MS = 150;

const VARIANT_ICONS: Record<ToastVariant, typeof Info> = {
  error: XCircle,
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
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
      <Alert variant={variant} className="shadow-lg">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="flex-1">{message}</p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Cerrar aviso"
            className="rounded p-0.5 text-current opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </Alert>
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
