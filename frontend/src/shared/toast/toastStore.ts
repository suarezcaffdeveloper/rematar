/**
 * Manejo global de errores/avisos (Épica 4, Módulo 4.1): cualquier parte de la app --
 * un formulario, un interceptor, un guard -- puede llamar `useToastStore.getState().push(...)`
 * para mostrar un mensaje, sin tener que renderizar nada localmente ni levantar el
 * mensaje por props. `ToastViewport` (montado una única vez en `RootLayout`) es lo
 * único que efectivamente dibuja algo en pantalla.
 */

import { create } from 'zustand';

export type ToastVariant = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (variant: ToastVariant, message: string) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push(variant, message) {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, variant, message }] }));
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
