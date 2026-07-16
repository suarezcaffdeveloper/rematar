import { useEffect } from 'react';
import { useToastStore } from './toastStore';
import { Alert } from '../components/Alert';

const AUTO_DISMISS_MS = 5000;

function ToastItem({ id, variant, message }: { id: string; variant: 'error' | 'success' | 'info'; message: string }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [id, dismiss]);

  return (
    <Alert variant={variant} className="shadow-lg">
      <div className="flex items-start gap-3">
        <p className="flex-1">{message}</p>
        <button
          type="button"
          onClick={() => dismiss(id)}
          aria-label="Cerrar aviso"
          className="text-current opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </Alert>
  );
}

/**
 * Se monta una única vez, en `RootLayout` -- todo el resto de la app le habla a
 * través de `useToastStore.getState().push(...)`, nunca renderizando un toast
 * localmente.
 */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem {...toast} />
        </div>
      ))}
    </div>
  );
}
