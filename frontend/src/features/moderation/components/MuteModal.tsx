import { useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { muteBuyerRequest } from '../api';

export interface MuteModalProps {
  isOpen: boolean;
  onClose: () => void;
  remateId: string;
  buyerId: string;
  buyerName: string | null;
  onMuted: () => void;
}

const DURATION_OPTIONS = [
  { label: '1 minuto', seconds: 60 },
  { label: '5 minutos', seconds: 300 },
  { label: '10 minutos', seconds: 600 },
  { label: '30 minutos', seconds: 1800 },
  { label: '1 hora', seconds: 3600 },
];

/** Silenciar temporalmente a un comprador puntual (Épica 7, Módulo 7.6) -- distinto de
 * bloquear el chat completo (`LockChatButton`). Duración configurable, tope de 1 hora
 * (mismo límite que valida el backend, `MuteRequest.duration_seconds`). */
export function MuteModal({ isOpen, onClose, remateId, buyerId, buyerName, onMuted }: MuteModalProps) {
  const [durationSeconds, setDurationSeconds] = useState(DURATION_OPTIONS[1].seconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      await muteBuyerRequest(remateId, buyerId, durationSeconds);
      onMuted();
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
      title={`Silenciar a ${buyerName ?? 'este comprador'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} isLoading={isSubmitting}>
            Silenciar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="error">{error}</Alert>}
        <Select
          label="Duración"
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(Number(e.target.value))}
        >
          {DURATION_OPTIONS.map((option) => (
            <option key={option.seconds} value={option.seconds}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}
