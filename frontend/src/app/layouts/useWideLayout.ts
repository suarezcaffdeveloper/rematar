import { useEffect } from 'react';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

/**
 * Pide que `AppLayout` renderice `<main>` sin el `max-w-5xl` por default -- para
 * pantallas tipo "sala de operación" que necesitan más ancho para un layout de
 * columnas (Sala del Remate; Consola Operativa más adelante). Mismo patrón que
 * `useBreadcrumb`: la página declara su preferencia al montar, se limpia sola al
 * desmontar (así la página siguiente no hereda un layout ancho que no pidió).
 */
export function useWideLayout(): void {
  const setWide = useLayoutPreferencesStore((state) => state.setWide);

  useEffect(() => {
    setWide(true);
    return () => setWide(false);
  }, [setWide]);
}
