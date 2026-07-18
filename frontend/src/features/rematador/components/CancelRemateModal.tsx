import { useEffect, useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Textarea } from '../../../shared/components/Textarea';
import { cancelRemateRequest } from '../../remates/api';
import type { Remate } from '../../remates/types';

export interface CancelRemateModalProps {
  isOpen: boolean;
  onClose: () => void;
  remate: Remate;
  onCancelled: (remate: Remate) => void;
}

const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;

/**
 * Cancelar un remate (Épica 5, Módulo 5.3) -- `POST /remates/{id}/cancel` exige un
 * motivo (`RemateCancelRequest.reason`, RF-11), así que `window.confirm` (usado en
 * módulos anteriores para "Finalizar remate") no alcanza acá: no puede capturar texto.
 * Primer uso de un modal con motivo en el proyecto.
 */
export function CancelRemateModal({ isOpen, onClose, remate, onCancelled }: CancelRemateModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setError(null);
  }, [isOpen]);

  const trimmedLength = reason.trim().length;
  const isReasonValid = trimmedLength >= REASON_MIN_LENGTH && trimmedLength <= REASON_MAX_LENGTH;

  async function handleConfirm() {
    if (!isReasonValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const cancelled = await cancelRemateRequest(remate.id, reason.trim());
      onCancelled(cancelled);
      onClose();
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancelar remate"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Volver
          </Button>
          <Button variant="danger" onClick={handleConfirm} isLoading={isSubmitting} disabled={!isReasonValid}>
            Cancelar remate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          ¿Seguro que querés cancelar <strong>{remate.title}</strong>? Esta acción no se puede deshacer, pero
          el remate queda conservado (no eliminado) con el motivo para su historial.
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        <Textarea
          label="Motivo de la cancelación"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={
            reason.length > 0 && !isReasonValid
              ? `El motivo debe tener entre ${REASON_MIN_LENGTH} y ${REASON_MAX_LENGTH} caracteres.`
              : undefined
          }
          maxLength={REASON_MAX_LENGTH}
        />
      </div>
    </Modal>
  );
}
