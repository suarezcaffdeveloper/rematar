import { useEffect, useState } from 'react';
import { ArrowRight, Eye, Info, TriangleAlert } from 'lucide-react';
import { normalizeApiError } from '../../../../shared/api/errors';
import { Alert } from '../../../../shared/components/Alert';
import { Button } from '../../../../shared/components/Button';
import { Input } from '../../../../shared/components/Input';
import { Modal } from '../../../../shared/components/Modal';
import { Textarea } from '../../../../shared/components/Textarea';
import { useToastStore } from '../../../../shared/toast/toastStore';
import { changeVentaEstadoRequest } from '../../api';
import { STATUS_LABELS } from '../../labels';
import { NEXT_ACTIONS, buyerNotificationTitle, skippedStatuses } from '../../sales';
import type { PostAuctionStatus } from '../../types';
import { SaleStatusPill } from './SaleStatusPill';

const NOTE_MAX = 2000;

export interface StatusChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  loteTitle: string;
  buyerName: string | null;
  from: PostAuctionStatus;
  to: PostAuctionStatus;
  /** Se llama tras un cambio exitoso, para que quien abrió el diálogo recargue. */
  onChanged: () => void;
}

/** `Date` -> `YYYY-MM-DDTHH:mm` en hora LOCAL, el formato de `<input type="datetime-local">`. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Confirmación de un cambio de estado de la venta. Reemplaza al select + botón de
 * `StatusChangeForm`: el backend ya aceptaba una observación (`note`) y la fecha en la que
 * ocurrió el hecho (`occurred_at`), pero la pantalla nunca las mandaba. Acá además se avisa
 * lo que antes no se decía: que un salto de varios pasos deja esos pasos sin fecha, que el
 * estado no se puede volver atrás, y que el comprador ve la observación y recibe un aviso.
 *
 * `occurred_at` solo se manda si la empresa tocó la fecha (por defecto es "ahora" y el
 * backend ya usa el momento actual); nunca puede ser futura.
 */
export function StatusChangeDialog({ isOpen, onClose, caseId, loteTitle, buyerName, from, to, onChanged }: StatusChangeDialogProps) {
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [whenTouched, setWhenTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNote('');
    setWhen(toLocalInput(new Date()));
    setWhenTouched(false);
    setError(null);
  }, [isOpen, from, to]);

  const skipped = skippedStatuses(from, to);
  const isNextStep = skipped.length === 0;
  const title = isNextStep ? (NEXT_ACTIONS[from]?.label ?? 'Cambiar estado') : 'Cambiar estado';
  const maxWhen = toLocalInput(new Date());

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      const occurred = whenTouched ? new Date(when) : null;
      await changeVentaEstadoRequest(caseId, {
        new_status: to,
        note: note.trim() || undefined,
        occurred_at: occurred && !Number.isNaN(occurred.getTime()) && occurred.getTime() <= Date.now() ? occurred.toISOString() : undefined,
      });
      useToastStore.getState().push('success', `Estado actualizado a “${STATUS_LABELS[to]}”.`);
      onChanged();
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
      title={title}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} isLoading={isSubmitting}>
            Confirmar cambio
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 font-display">
        <div>
          <p className="text-sm text-ink-muted">
            {loteTitle}
            {buyerName ? ` · ${buyerName}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <SaleStatusPill status={from} />
            <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-faint" />
            <SaleStatusPill status={to} />
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {isNextStep ? (
          <p className="flex gap-2.5 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Solo se puede avanzar: una vez cambiado, el estado no se puede volver atrás.
          </p>
        ) : (
          <p className="flex gap-2.5 rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-900">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Vas a saltear {skipped.length === 1 ? 'un paso' : `${skipped.length} pasos`}:</b>{' '}
              {skipped.map((status) => STATUS_LABELS[status]).join(', ')}. Esos pasos quedan sin fecha y no se puede volver atrás.
            </span>
          </p>
        )}

        <Input
          label="¿Cuándo ocurrió?"
          type="datetime-local"
          value={when}
          max={maxWhen}
          onChange={(event) => {
            setWhen(event.target.value);
            setWhenTouched(true);
          }}
        />
        <p className="-mt-3 text-xs text-ink-muted">Dejá la fecha de ahora, o poné cuándo pasó de verdad si lo estás cargando tarde.</p>

        <div className="flex flex-col gap-1.5">
          <Textarea
            label="Observación (opcional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={NOTE_MAX}
            placeholder="Ej.: Transfirió desde el Banco Nación, comprobante adjunto."
          />
          <span className="self-end text-xs tabular-nums text-ink-faint">
            {note.length} / {NOTE_MAX}
          </span>
        </div>

        <p className="flex gap-2.5 rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-900">
          <Eye aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El comprador ve esta observación en su compra y recibe el aviso <b>“{buyerNotificationTitle(to)}”</b> en la app.
          </span>
        </p>
      </div>
    </Modal>
  );
}
