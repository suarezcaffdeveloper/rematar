import { type FormEvent, useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Textarea } from '../../../shared/components/Textarea';
import { addVentaNotaRequest } from '../api';

export interface NoteFormProps {
  caseId: string;
  onAdded: () => void;
}

/** Agregar una observación sin cambiar el estado (acción separada, pedida por el
 * enunciado: "Agregar observaciones" es distinto de "Cambiar el estado del proceso"). */
export function NoteForm({ caseId, onAdded }: NoteFormProps) {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addVentaNotaRequest(caseId, note.trim());
      setNote('');
      onAdded();
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}
      <Textarea
        label="Nueva observación"
        placeholder="Ej: el comprador pidió coordinar el retiro para el fin de semana"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" variant="secondary" isLoading={isSubmitting} className="self-start">
        Agregar observación
      </Button>
    </form>
  );
}
