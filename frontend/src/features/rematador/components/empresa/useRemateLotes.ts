import { useEffect, useRef } from 'react';
import { useLotes, type UseLotesResult } from '../../../remates/hooks';

/** Todos los lotes del remate, que se vuelven a pedir cuando se adjudica uno nuevo
 * (`closedSold` es `lote_status_counts.closed_sold` de la analítica en vivo). */
export function useRemateLotes(remateId: string, closedSold: number | undefined): UseLotesResult {
  const result = useLotes(remateId);
  const { reload } = result;
  const last = useRef(closedSold);
  useEffect(() => {
    if (closedSold !== undefined && last.current !== closedSold) {
      last.current = closedSold;
      reload();
    }
  }, [closedSold, reload]);
  return result;
}
