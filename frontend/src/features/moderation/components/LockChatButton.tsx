import { useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { lockChatRequest } from '../api';

export interface LockChatButtonProps {
  remateId: string;
  onLocked: () => void;
}

const DURATION_OPTIONS = [
  { label: '1 minuto', seconds: 60 },
  { label: '5 minutos', seconds: 300 },
  { label: '10 minutos', seconds: 600 },
  { label: '30 minutos', seconds: 1800 },
];

/** Bloquear el envío de mensajes para toda la sala (Épica 7, Módulo 7.6) -- distinto de
 * silenciar a un comprador puntual (`MuteModal`): un "modo lento" para calmar un chat
 * caldeado, afecta a todos los compradores conectados por igual. */
export function LockChatButton({ remateId, onLocked }: LockChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(DURATION_OPTIONS[1].seconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      await lockChatRequest(remateId, durationSeconds);
      onLocked();
      setIsOpen(false);
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Bloquear chat
      </Button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Bloquear el chat de la sala"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} isLoading={isSubmitting}>
              Bloquear
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert variant="error">{error}</Alert>}
          <p className="text-sm text-slate-600">
            Ningún comprador va a poder enviar mensajes en el chat durante este tiempo.
          </p>
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
    </>
  );
}
