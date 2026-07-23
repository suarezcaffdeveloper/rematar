import { type FormEvent, useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Select } from '../../../shared/components/Select';
import { Textarea } from '../../../shared/components/Textarea';
import { normalizeApiError } from '../../../shared/api/errors';
import { changeVentaEstadoRequest } from '../api';
import { nextStatusOptions, STATUS_LABELS } from '../labels';
import type { PostAuctionStatus } from '../types';

export interface StatusChangeFormProps {
  caseId: string;
  currentStatus: PostAuctionStatus;
  onChanged: () => void;
}

/**
 * Cambiar el estado del proceso post-remate (pedido explícito del enunciado) -- un único
 * formulario cubre también "registrar fecha de contacto/pago/envío/entrega": el backend
 * (`PostAuctionService.change_status`) estampa la fecha hito correspondiente al llegar a
 * ese estado, así que no hacen falta cuatro acciones separadas.
 */
export function StatusChangeForm({ caseId, currentStatus, onChanged }: StatusChangeFormProps) {
  const options = nextStatusOptions(currentStatus);
  const [newStatus, setNewStatus] = useState<PostAuctionStatus | ''>(options[0] ?? '');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (options.length === 0) {
    return <Alert variant="success">Este caso ya llegó al último estado del flujo.</Alert>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newStatus) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await changeVentaEstadoRequest(caseId, { new_status: newStatus, note: note || undefined });
      setNote('');
      onChanged();
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}
      <Select
        label="Nuevo estado"
        value={newStatus}
        onChange={(e) => setNewStatus(e.target.value as PostAuctionStatus)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {STATUS_LABELS[option]}
          </option>
        ))}
      </Select>
      <Textarea
        label="Observación (opcional)"
        placeholder="Detalle sobre este cambio de estado"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" isLoading={isSubmitting} className="self-start">
        Cambiar estado
      </Button>
    </form>
  );
}
