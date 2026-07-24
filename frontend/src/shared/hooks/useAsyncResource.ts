import { useEffect, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../api/errors';

export interface UseAsyncResourceResult<T> {
  data: T;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/**
 * Boilerplate compartido de "fetch por HTTP disparado por deps, con cancelación en el
 * cleanup y `reload()` manual" -- mismo patrón que repetían por separado, con copy-paste
 * casi idéntico, `features/{moderation,postauction,history,audit}/hooks.ts` y
 * `features/sala/hooks.ts::useRemateSnapshot` (Épica 8, Módulo 8.0, revisión técnica).
 *
 * `enabled: false` deja `isLoading` en su valor inicial (`true`) sin llamar a `fetcher` --
 * mismo comportamiento que el `if (!id) return` al principio del efecto que cada hook
 * resolvía a mano (útil para IDs que todavía no llegaron, ej. `remateId`/`caseId` vacíos).
 */
export function useAsyncResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  initialData: T,
  options?: { enabled?: boolean },
): UseAsyncResourceResult<T> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, reloadToken]);

  return { data, isLoading, error, reload: () => setReloadToken((token) => token + 1) };
}
