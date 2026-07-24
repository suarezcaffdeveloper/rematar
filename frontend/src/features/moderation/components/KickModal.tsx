import { useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Textarea } from '../../../shared/components/Textarea';
import { kickBuyerRequest } from '../api';

export interface KickModalProps {
  isOpen: boolean;
  onClose: () => void;
  remateId: string;
  buyerId: string;
  buyerName: string | null;
  onKicked: () => void;
}

/** Expulsar a un comprador (Épica 7, Módulo 7.6) -- expulsión + impedir el reingreso son
 * una única acción del lado del backend (`ModerationService.kick_user`, ver
 * docs/42-moderacion-en-tiempo-real.md), así que un único modal alcanza para ambas. */
export function KickModal({ isOpen, onClose, remateId, buyerId, buyerName, onKicked }: KickModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      await kickBuyerRequest(remateId, buyerId, reason || undefined);
      setReason('');
      onKicked();
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
      title={`Expulsar a ${buyerName ?? 'este comprador'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleConfirm} isLoading={isSubmitting}>
            Expulsar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="error">{error}</Alert>}
        <p className="text-sm text-slate-600">
          No va a poder volver a ingresar a la sala mientras el remate siga activo.
        </p>
        <Textarea
          label="Motivo (opcional)"
          placeholder="Ej: lenguaje inapropiado en el chat"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
