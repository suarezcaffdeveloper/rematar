import { useLayoutEffect } from 'react';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

export interface UseTopNavLayoutOptions {
  /** La barra se queda fija al principio de la página: no sigue el scroll ni se achica a
   * píldora (ver `BuyerTopNav`). Para la Sala en vivo. Default `false`. */
  staticBar?: boolean;
}

/**
 * Pide que `AppLayout` reemplace `Sidebar` + `Header` por la barra superior `BuyerTopNav`
 * y deje el `<main>` sin ancho ni padding (la página arma su propio contenedor). Mismo
 * patrón que `useWideLayout`: se declara al montar y se limpia sola al desmontar, así la
 * pantalla siguiente vuelve al layout de siempre.
 */
export function useTopNavLayout({ staticBar = false }: UseTopNavLayoutOptions = {}): void {
  const setTopNav = useLayoutPreferencesStore((state) => state.setTopNav);

  // `useLayoutEffect`: se aplica antes del primer pintado, así no se alcanza a ver un
  // instante el `Sidebar` + `Header` antes de que los reemplace la barra superior.
  useLayoutEffect(() => {
    setTopNav(true, staticBar);
    return () => setTopNav(false);
  }, [setTopNav, staticBar]);
}
