import { useEffect, useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { Textarea } from '../../../shared/components/Textarea';
import { createLoteRequest, updateLoteRequest } from '../../remates/api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { LoteGalleryManager } from './LoteGalleryManager';
import { PlusIcon, TrashIcon } from './icons';
import {
  DEFAULT_LOTE_FORM_VALUES,
  buildLoteFormPayload,
  loteToFormValues,
  validateLoteForm,
  type LoteFormValues,
} from '../loteForm';

export interface LoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  remateId: string;
  /** Presente en modo edición; ausente en modo creación. */
  lote?: Lote;
  onSaved: (lote: Lote) => void;
}

/**
 * Formulario de Lote, crear y editar (Épica 5, Módulo 5.3) -- mismos campos pedidos por
 * el enunciado: número, nombre, descripción, categoría, peso, información técnica,
 * precio inicial, incremento mínimo. "Estado" se muestra como referencia (badge, cuando
 * hay un `lote` en edición) pero no es editable acá: el backend no expone ninguna
 * transición vía `PATCH` (`docs/15-modulo-lote.md`) -- todo lote en un remate
 * `draft`/`scheduled` está siempre en `pending`, así que no hay nada que elegir.
 *
 * La galería de imágenes (Épica 6, Módulo 6.1, `LoteGalleryManager`) solo se muestra en
 * modo edición: subir una imagen requiere un `lote_id` real (`POST .../lotes/{id}/
 * images`), que todavía no existe mientras se está creando el lote -- ver
 * docs/32-gestion-multimedia-lotes.md para la decisión completa. `currentLote` guarda la
 * versión más reciente del lote dentro del modal para que la galería refleje sus propios
 * cambios (subir/eliminar/reordenar) sin esperar a que el modal se cierre.
 */
export function LoteFormModal({ isOpen, onClose, remateId, lote, onSaved }: LoteFormModalProps) {
  const isEditMode = Boolean(lote);
  const [values, setValues] = useState<LoteFormValues>(DEFAULT_LOTE_FORM_VALUES);
  const [errors, setErrors] = useState<ReturnType<typeof validateLoteForm>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentLote, setCurrentLote] = useState<Lote | undefined>(lote);

  useEffect(() => {
    if (!isOpen) return;
    setValues(lote ? loteToFormValues(lote) : DEFAULT_LOTE_FORM_VALUES);
    setErrors({});
    setSubmitError(null);
    setCurrentLote(lote);
  }, [isOpen, lote]);

  function setField<K extends keyof LoteFormValues>(field: K, value: LoteFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function addAttributeRow() {
    setField('attributeRows', [...values.attributeRows, { key: '', value: '' }]);
  }

  function updateAttributeRow(index: number, patch: Partial<{ key: string; value: string }>) {
    setField(
      'attributeRows',
      values.attributeRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeAttributeRow(index: number) {
    setField(
      'attributeRows',
      values.attributeRows.filter((_, i) => i !== index),
    );
  }

  async function handleSubmit() {
    const validationErrors = validateLoteForm(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildLoteFormPayload(values);
      const saved = lote
        ? await updateLoteRequest(remateId, lote.id, payload)
        : await createLoteRequest(remateId, payload);
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
      title={isEditMode ? 'Editar lote' : 'Crear lote'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            {isEditMode ? 'Guardar cambios' : 'Crear lote'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {submitError && <Alert variant="error">{submitError}</Alert>}

        {lote && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Estado:</span>
            <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
          <Input
            label="Número de lote"
            value={values.lot_number}
            onChange={(event) => setField('lot_number', event.target.value)}
            error={errors.lot_number}
          />
          <Input
            label="Nombre"
            value={values.title}
            onChange={(event) => setField('title', event.target.value)}
            error={errors.title}
          />
        </div>

        <Select
          label="Categoría"
          value={values.category}
          onChange={(event) => setField('category', event.target.value as LoteFormValues['category'])}
          error={errors.category}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Peso (kg)"
            type="number"
            min={0}
            step="0.01"
            value={values.peso_kg}
            onChange={(event) => setField('peso_kg', event.target.value)}
            error={errors.peso_kg}
          />
          <Input
            label="Cantidad"
            type="number"
            min={1}
            step="1"
            value={values.quantity}
            onChange={(event) => setField('quantity', event.target.value)}
            error={errors.quantity}
          />
          <Input
            label="Unidad (ej. cabezas)"
            value={values.unit_label}
            onChange={(event) => setField('unit_label', event.target.value)}
            error={errors.unit_label}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Información técnica</h3>
            <Button type="button" variant="ghost" onClick={addAttributeRow}>
              <PlusIcon className="h-4 w-4" />
              Agregar atributo
            </Button>
          </div>
          {errors.attributes && <p className="mt-1 text-sm text-danger-600">{errors.attributes}</p>}
          {values.attributeRows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              Sin atributos adicionales -- agregá, por ejemplo, "raza" o "año".
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {values.attributeRows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    aria-label={`Clave del atributo ${index + 1}`}
                    placeholder="Clave (ej. raza)"
                    value={row.key}
                    onChange={(event) => updateAttributeRow(index, { key: event.target.value })}
                    className="w-1/3 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <input
                    aria-label={`Valor del atributo ${index + 1}`}
                    placeholder="Valor (ej. Angus)"
                    value={row.value}
                    onChange={(event) => updateAttributeRow(index, { value: event.target.value })}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <button
                    type="button"
                    aria-label={`Quitar atributo ${index + 1}`}
                    onClick={() => removeAttributeRow(index)}
                    className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-danger-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Precio inicial"
            type="number"
            min={0}
            step="0.01"
            value={values.base_price}
            onChange={(event) => setField('base_price', event.target.value)}
            error={errors.base_price}
          />
          <Input
            label="Incremento mínimo"
            type="number"
            min={0}
            step="0.01"
            value={values.min_increment}
            onChange={(event) => setField('min_increment', event.target.value)}
            error={errors.min_increment}
          />
          <Input
            label="Precio de reserva (opcional)"
            type="number"
            min={0}
            step="0.01"
            value={values.reserve_price}
            onChange={(event) => setField('reserve_price', event.target.value)}
            error={errors.reserve_price}
          />
        </div>
        <p className="-mt-2 text-xs text-slate-400">
          El precio de reserva nunca se muestra a los compradores -- solo lo ves vos.
        </p>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Imágenes</h3>
          {currentLote ? (
            <LoteGalleryManager
              remateId={remateId}
              lote={currentLote}
              onChanged={(updated) => {
                setCurrentLote(updated);
                onSaved(updated);
              }}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Guardá el lote para poder agregarle imágenes.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
