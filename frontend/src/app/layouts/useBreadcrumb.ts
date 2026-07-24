import { useEffect } from 'react';
import { useBreadcrumbStore } from './breadcrumbStore';
import type { BreadcrumbItem } from '../../shared/components/Breadcrumb';

/**
 * Declara los items de breadcrumb de la página actual -- el `Header` (montado en
 * `AppLayout`) es quien efectivamente los dibuja, una única vez por pantalla. Se
 * limpia solo al desmontar, para que la página siguiente no herede items viejos por
 * una fracción de segundo mientras carga los suyos.
 */
export function useBreadcrumb(items: BreadcrumbItem[]): void {
  const setItems = useBreadcrumbStore((state) => state.setItems);

  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, [items, setItems]);
}
