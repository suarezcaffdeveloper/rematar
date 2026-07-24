import { useEffect, useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { Textarea } from '../../../shared/components/Textarea';
import { createRemateRequest, updateRemateRequest } from '../../remates/api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { RemateCoverImageField } from './RemateCoverImageField';
import {
  DEFAULT_REMATE_FORM_VALUES,
  buildRemateFormPayload,
  remateToFormValues,
  validateRemateForm,
  type RemateFormValues,
} from '../remateForm';

export interface RemateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Presente en modo edición; ausente en modo creación -- un único componente para las
   * dos operaciones (pedido explícito del enunciado: "formularios reutilizables"). */
  remate?: Remate;
  onSaved: (remate: Remate) => void;
}

/**
 * Formulario de Remate, crear y editar (Épica 5, Módulo 5.3). Valida en el cliente
 * (`validateRemateForm`) antes de llamar al backend -- si igual llega un error de
 * negocio (por ejemplo, el remate dejó de estar en `draft`/`scheduled` mientras el modal
 * estaba abierto), se muestra en un `Alert` dentro del propio modal, sin cerrarlo, para
 * que el usuario no pierda lo que ya completó.
 */
export function RemateFormModal({ isOpen, onClose, remate, onSaved }: RemateFormModalProps) {
  const isEditMode = Boolean(remate);
  const [values, setValues] = useState<RemateFormValues>(DEFAULT_REMATE_FORM_VALUES);
  const [errors, setErrors] = useState<ReturnType<typeof validateRemateForm>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(remate ? remateToFormValues(remate) : DEFAULT_REMATE_FORM_VALUES);
    setErrors({});
    setSubmitError(null);
  }, [isOpen, remate]);

  function setField<K extends keyof RemateFormValues>(field: K, value: RemateFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateRemateForm(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildRemateFormPayload(values);
      const saved = remate ? await updateRemateRequest(remate.id, payload) : await createRemateRequest(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Editar remate' : 'Crear remate'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            {isEditMode ? 'Guardar cambios' : 'Crear remate'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {submitError && <Alert variant="error">{submitError}</Alert>}

        <Input
          label="Título"
          value={values.title}
          onChange={(event) => setField('title', event.target.value)}
          error={errors.title}
          required
        />

        <Select
          label="Categoría"
          value={values.category}
          onChange={(event) => setField('category', event.target.value as RemateFormValues['category'])}
          error={errors.category}
          required
        >
          <option value="">Elegir…</option>
          {CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>

        <Textarea
          label="Descripción"
          value={values.description}
          onChange={(event) => setField('description', event.target.value)}
          error={errors.description}
        />

        <Input
          label="Ubicación"
          value={values.location}
          onChange={(event) => setField('location', event.target.value)}
          error={errors.location}
        />

        <RemateCoverImageField
          value={values.cover_image_url}
          onChange={(url) => setField('cover_image_url', url)}
          error={errors.cover_image_url}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Fecha y hora de inicio"
            type="datetime-local"
            value={values.starts_at}
            onChange={(event) => setField('starts_at', event.target.value)}
            error={errors.starts_at}
          />
          <Input
            label="Fecha y hora de fin estimada"
            type="datetime-local"
            value={values.ends_at}
            onChange={(event) => setField('ends_at', event.target.value)}
            error={errors.ends_at}
          />
        </div>
        <p className="-mt-2 text-xs text-slate-400">
          La fecha de inicio hace falta para publicar el remate más adelante -- no es obligatoria
          para guardarlo como borrador.
        </p>

        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Configuración</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Moneda (código de 3 letras)"
              value={values.currency}
              onChange={(event) => setField('currency', event.target.value)}
              error={errors.currency}
              maxLength={3}
            />
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={values.anti_sniping_enabled}
                onChange={(event) => setField('anti_sniping_enabled', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Habilitar anti-sniping
            </label>
          </div>
          {values.anti_sniping_enabled && (
            <div className="mt-3">
              <Input
                label="Segundos de extensión ante una oferta de último momento"
                type="number"
                min={10}
                max={600}
                value={values.anti_sniping_extension_seconds}
                onChange={(event) => setField('anti_sniping_extension_seconds', event.target.value)}
                error={errors.anti_sniping_extension_seconds}
              />
            </div>
          )}

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.lote_timer_enabled}
              onChange={(event) => setField('lote_timer_enabled', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Habilitar cuenta regresiva por lote
          </label>
          {values.lote_timer_enabled && (
            <div className="mt-3">
              <Input
                label="Segundos de cuenta regresiva al abrir cada lote"
                type="number"
                min={5}
                max={3600}
                value={values.lote_timer_seconds}
                onChange={(event) => setField('lote_timer_seconds', event.target.value)}
                error={errors.lote_timer_seconds}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
