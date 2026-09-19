import { useEffect, useId, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { env } from '../../../shared/config/env';
import { formatCurrency } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { createGarantiaRequest, fetchMyGarantiaRequest } from '../api';
import { mountCardPaymentBrick, type MountedCardPaymentBrick } from '../mercadopagoBrick';
import type { Garantia, GarantiaStatus } from '../types';

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 12; // ~30s -- tiempo de sobra para que MP confirme una tarjeta.

export interface GarantiaGateProps {
  remateId: string;
  /** Monto exigido (`RemateSettings.guarantee_amount`, ya validado no-nulo por quien
   * renderiza este componente -- ver `SalaPage`). */
  amount: string;
  currency: string;
  /** Notifica cada cambio de estado hacia arriba -- `SalaPage` lo necesita para
   * habilitar/deshabilitar `PlaceBidButton` (ver `SalaBidPanel`). */
  onStatusChange?: (status: GarantiaStatus | null) => void;
}

/**
 * Gate de garantía económica para el comprador: mientras no haya una `Garantia`
 * `active` para este remate, muestra un aviso con el monto y un botón para
 * constituirla (consentimiento informado -> Payment Brick de Mercado Pago -> polling
 * hasta que se resuelve). El backend es la única defensa real (`AuctionEngine.
 * place_bid`, Fase 4 del plan) -- esto es UX, para no dejar que el comprador llegue al
 * botón "Ofertar" y recién ahí se entere de que hace falta la garantía.
 *
 * `active`/`captured`/`released` terminales de este remate no vuelven a pedir nada
 * (mismo criterio que el backend: `captured`/`released` solo ocurren después de que el
 * remate cierra, momento en el que ya no tiene sentido seguir ofertando).
 */
export function GarantiaGate({ remateId, amount, currency, onStatusChange }: GarantiaGateProps) {
  const [garantia, setGarantia] = useState<Garantia | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  const statusRef = useRef<GarantiaStatus | null>(null);
  function updateGarantia(next: Garantia | null) {
    setGarantia(next);
    const nextStatus = next?.status ?? null;
    if (statusRef.current !== nextStatus) {
      statusRef.current = nextStatus;
      onStatusChange?.(nextStatus);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchMyGarantiaRequest(remateId)
      .then((data) => {
        if (!cancelled) updateGarantia(data);
      })
      .catch((err) => {
        if (!cancelled) useToastStore.getState().push('error', normalizeApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `updateGarantia` cierra sobre `onStatusChange`, que puede cambiar de identidad en
    // cada render del padre; re-suscribir el fetch por eso rompería el polling en curso
    // sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remateId]);

  function openModal() {
    setHasConsented(false);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  function handleResolved(resolved: Garantia) {
    updateGarantia(resolved);
    if (resolved.status === 'active') {
      useToastStore.getState().push('success', 'Tu garantía quedó activa. Ya podés ofertar.');
      closeModal();
    }
  }

  if (isLoading) {
    return (
      <Alert variant="info" className="flex items-center gap-2">
        <Spinner size="sm" />
        Verificando el estado de tu garantía económica...
      </Alert>
    );
  }

  if (garantia?.status === 'active') {
    return (
      <Alert variant="success" className="flex items-center justify-between gap-3">
        <span>Garantía activa para este remate.</span>
        <Badge variant="success">{formatCurrency(garantia.amount, garantia.currency)}</Badge>
      </Alert>
    );
  }

  return (
    <>
      <Alert variant="warning" className="flex flex-wrap items-center justify-between gap-3">
        <span>
          Este remate exige una garantía de {formatCurrency(amount, currency)} para poder ofertar.
        </span>
        <Button variant="secondary" onClick={openModal}>
          Constituir garantía
        </Button>
      </Alert>

      <GarantiaModal
        isOpen={isModalOpen}
        onClose={closeModal}
        remateId={remateId}
        amount={amount}
        currency={currency}
        hasConsented={hasConsented}
        onConsent={() => setHasConsented(true)}
        onResolved={handleResolved}
      />
    </>
  );
}

interface GarantiaModalProps {
  isOpen: boolean;
  onClose: () => void;
  remateId: string;
  amount: string;
  currency: string;
  hasConsented: boolean;
  onConsent: () => void;
  onResolved: (garantia: Garantia) => void;
}

function GarantiaModal({
  isOpen,
  onClose,
  remateId,
  amount,
  currency,
  hasConsented,
  onConsent,
  onResolved,
}: GarantiaModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Garantía económica" size="md">
      {!hasConsented ? (
        <ConsentStep amount={amount} currency={currency} onConsent={onConsent} onCancel={onClose} />
      ) : (
        <CardPaymentStep remateId={remateId} amount={amount} onResolved={onResolved} />
      )}
    </Modal>
  );
}

function ConsentStep({
  amount,
  currency,
  onConsent,
  onCancel,
}: {
  amount: string;
  currency: string;
  onConsent: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink">
        Para ofertar en este remate, vamos a retener{' '}
        <strong className="font-semibold">{formatCurrency(amount, currency)}</strong> en tu
        tarjeta de crédito como garantía.
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-faint">
        <li>No es un cobro: es un bloqueo temporal (preautorización) en tu tarjeta.</li>
        <li>Si no ganás ningún lote, se libera automáticamente al cerrar el remate.</li>
        <li>Si ganás un lote, este monto se descuenta del precio final.</li>
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onConsent}>Entiendo, continuar</Button>
      </div>
    </div>
  );
}

function CardPaymentStep({
  remateId,
  amount,
  onResolved,
}: {
  remateId: string;
  amount: string;
  onResolved: (garantia: Garantia) => void;
}) {
  const containerId = useId().replace(/:/g, '');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const brickRef = useRef<MountedCardPaymentBrick | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ver el efecto de más abajo que monta el Brick -- este ref sobrevive al doble
  // montaje/desmontaje que `React.StrictMode` simula en desarrollo, a diferencia de
  // cualquier variable declarada dentro del efecto.
  const hasStartedMountRef = useRef(false);

  useEffect(() => {
    return () => {
      brickRef.current?.unmount();
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  async function pollUntilResolved(attempt: number) {
    const current = await fetchMyGarantiaRequest(remateId);
    if (!current || current.status === 'pending_authorization') {
      if (attempt >= POLL_MAX_ATTEMPTS) {
        setIsProcessing(false);
        setSubmitError(
          'Mercado Pago todavía está procesando la autorización. Volvé a intentar en unos minutos.',
        );
        return;
      }
      pollTimeoutRef.current = setTimeout(() => void pollUntilResolved(attempt + 1), POLL_INTERVAL_MS);
      return;
    }
    setIsProcessing(false);
    onResolved(current);
  }

  async function handleBrickSubmit(cardFormData: Record<string, unknown>) {
    setSubmitError(null);
    setIsProcessing(true);
    try {
      const result = await createGarantiaRequest(remateId, cardFormData);
      if (result.status === 'pending_authorization') {
        void pollUntilResolved(1);
        return;
      }
      setIsProcessing(false);
      if (result.status === 'failed') {
        setSubmitError(result.failure_reason ?? 'Mercado Pago rechazó la tarjeta.');
      }
      onResolved(result);
    } catch (err) {
      setIsProcessing(false);
      setSubmitError(normalizeApiError(err).message);
    }
  }

  useEffect(() => {
    if (!env.mercadopagoPublicKey) return;
    // `React.StrictMode` (desarrollo) simula un montaje -> desmontaje -> montaje
    // apenas se monta el componente, disparando este efecto dos veces casi
    // sincrónicamente. `mountCardPaymentBrick` es async (carga el SDK, llama a
    // `create()`) -- para cuando la limpieza del primer disparo corre, esa llamada
    // todavía no resolvió, así que un simple flag `cancelled` (declarado adentro del
    // efecto, no sobrevive al segundo disparo) no alcanza para evitar que el SEGUNDO
    // disparo arranque una SEGUNDA llamada a `create()` sobre el mismo contenedor en
    // paralelo -- eso es lo que producía "Failed to execute 'removeChild'": dos Bricks
    // manipulando el mismo `<div>` a la vez, cada uno pisando los nodos del otro.
    // `hasStartedMountRef` sí sobrevive (es un ref): el segundo disparo lo ve en `true`
    // y no vuelve a llamar a `mountCardPaymentBrick`, así que como máximo se crea un
    // Brick real por instancia de este componente. El desmontaje real (no el
    // fantasma de StrictMode) lo resuelve el efecto de arriba, que sí llama a
    // `unmount()` sobre `brickRef.current` una vez que la promesa haya resuelto.
    if (hasStartedMountRef.current) return;
    hasStartedMountRef.current = true;

    mountCardPaymentBrick({
      containerId,
      publicKey: env.mercadopagoPublicKey,
      amount: Number(amount),
      callbacks: {
        onSubmit: handleBrickSubmit,
        onError: (error) => setSubmitError(normalizeApiError(error).message),
      },
    })
      .then((mounted) => {
        brickRef.current = mounted;
      })
      .catch((err: unknown) => {
        hasStartedMountRef.current = false;
        setSubmitError(err instanceof Error ? err.message : 'No se pudo cargar el formulario de tarjeta.');
      });
    // `handleBrickSubmit` cierra sobre `remateId`/`onResolved`, estables durante la
    // vida de este paso del modal; re-montar el Brick en cada render lo reiniciaría
    // innecesariamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, amount]);

  if (!env.mercadopagoPublicKey) {
    return (
      <Alert variant="warning">
        La carga de tarjeta no está disponible en este entorno todavía. Contactá al
        rematador si necesitás ofertar en este remate.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {submitError && <Alert variant="error">{submitError}</Alert>}
      <div id={containerId} />
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Spinner size="sm" />
          Procesando con Mercado Pago...
        </div>
      )}
    </div>
  );
}
