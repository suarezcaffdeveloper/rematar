import { useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../shared/api/errors';
import { useToastStore } from '../../shared/toast/toastStore';
import { fetchMyGarantiaRequest } from './api';
import type { Garantia, GarantiaStatus } from './types';

export interface UseGarantiaStatusResult {
  /** `GarantiaStatus` vigente para este remate, o `null` si todavía no se resolvió el
   * fetch inicial o no hay ninguna constituida -- mismo criterio que el `GarantiaGate`
   * original: `null` se trata igual que "sin garantía activa" (ver `SalaPage`,
   * `hasRequiredGuarantee`). */
  status: GarantiaStatus | null;
  /** Registra una resolución nueva (la del fetch inicial o la del `GarantiaModal` tras
   * constituirla) y la reporta hacia afuera. */
  reportGarantia: (garantia: Garantia | null) => void;
}

/**
 * Fuente de verdad del estado de la garantía económica del comprador en la sala --
 * reemplaza al `GarantiaGate` (que resolvía el mismo fetch pero además pintaba un
 * banner propio) ahora que el gate visual vive dentro del propio botón de ofertar
 * (`PlaceBidButton`, "Construir garantía") y el diálogo lo abre ese botón
 * (`GarantiaModal`). Sin UI: solo el `GET /garantia/me` inicial y el callback para
 * propagar el resultado.
 */
export function useGarantiaStatus(
  remateId: string,
  onStatusChange?: (status: GarantiaStatus | null) => void,
): UseGarantiaStatusResult {
  const [status, setStatus] = useState<GarantiaStatus | null>(null);
  const statusRef = useRef<GarantiaStatus | null>(null);

  function reportGarantia(garantia: Garantia | null) {
    const nextStatus = garantia?.status ?? null;
    if (statusRef.current !== nextStatus) {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchMyGarantiaRequest(remateId)
      .then((data) => {
        if (!cancelled) reportGarantia(data);
      })
      .catch((err) => {
        if (!cancelled) useToastStore.getState().push('error', normalizeApiError(err).message);
      });
    return () => {
      cancelled = true;
    };
    // `reportGarantia` cierra sobre `onStatusChange`, que puede cambiar de identidad en
    // cada render del padre; re-suscribir el fetch por eso lo repetiría sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remateId]);

  return { status, reportGarantia };
}
