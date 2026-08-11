import { useEffect } from 'react';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

/**
 * Pide que `AppLayout` entre en "Modo Remate": oculta `Sidebar` y `Header` por completo
 * (no solo ensancha el `<main>`, a diferencia de `useWideLayout`) para que la Consola
 * Operativa del rematador quede sin ninguna navegación que distraiga mientras un remate
 * está en vivo. A diferencia de `useWideLayout` (la página que lo llama siempre quiere
 * ancho completo mientras está montada), acá `enabled` puede cambiar sin desmontar la
 * página -- la Consola sigue montada aunque el remate pase de `live` a `finished`, y ahí
 * el modo remate se tiene que desactivar solo, no hace falta navegar a otra pantalla.
 */
export function useFocusMode(enabled: boolean): void {
  const setFocusMode = useLayoutPreferencesStore((state) => state.setFocusMode);

  useEffect(() => {
    setFocusMode(enabled);
    return () => setFocusMode(false);
  }, [enabled, setFocusMode]);
}
