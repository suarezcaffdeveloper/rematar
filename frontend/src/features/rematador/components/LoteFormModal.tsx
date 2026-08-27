import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { Switch } from '../../../shared/components/Switch';
import { Textarea } from '../../../shared/components/Textarea';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  createLoteRequest,
  updateLoteImagesRequest,
  updateLoteRequest,
  uploadLoteImageRequest,
} from '../../remates/api';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../../remates/labels';
import type { Lote, LoteImage } from '../../remates/types';
import { FormSection } from './FormSection';
import { LoteGalleryManager } from './LoteGalleryManager';
import { LoteImageStager, type StagedImage } from './LoteImageStager';
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

const HELP_TIPS = [
  'Podés arrastrar imágenes del lote antes de guardarlo -- se suben automáticamente al crearlo.',
  'La primera imagen que subas será la principal; podés reordenarlas después.',
  'El precio de reserva nunca se muestra a los compradores, solo lo ves vos.',
];

/**
 * Formulario de Lote, crear y editar (Épica 5, Módulo 5.3; rediseño visual y
 * simplificación del flujo de creación de lotes -- mismo lenguaje visual que
 * `RemateFormModal`, ver `FormSection`). Solo campos genéricos (número, nombre, categoría,
 * descripción, precios): se sacaron "peso"/"cantidad"/"unidad" e "información técnica"
 * porque eran específicos de remates ganaderos (ver `loteForm.ts`).
 *
 * Imágenes: en modo edición sigue usando `LoteGalleryManager` (sube y persiste en vivo,
 * sin cambios). En modo creación usa `LoteImageStager` -- staging local, sin red -- y
 * recién sube los archivos elegidos DESPUÉS de crear el lote, como parte del mismo click
 * en "Crear lote" (ver `handleSubmit`), para que el usuario nunca tenga que "guardar y
 * después editar" solo para agregar fotos.
 */
export function LoteFormModal({ isOpen, onClose, remateId, lote, onSaved }: LoteFormModalProps) {
  const isEditMode = Boolean(lote);
  const [values, setValues] = useState<LoteFormValues>(DEFAULT_LOTE_FORM_VALUES);
  const [errors, setErrors] = useState<ReturnType<typeof validateLoteForm>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [currentLote, setCurrentLote] = useState<Lote | undefined>(lote);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [activeAction, setActiveAction] = useState<'save' | 'save-and-new' | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const lotNumberInputRef = useRef<HTMLInputElement>(null);
  const requeuePresetSwitchId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setValues(lote ? loteToFormValues(lote) : DEFAULT_LOTE_FORM_VALUES);
    setErrors({});
    setSubmitError(null);
    setCurrentLote(lote);
    setStagedImages([]);
  }, [isOpen, lote]);

  function setField<K extends keyof LoteFormValues>(field: K, value: LoteFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  /** Sube cada imagen elegida antes de guardar (ver docstring del componente) y persiste
   * el orden final en un único `PATCH`, igual criterio que `LoteGalleryManager.uploadAll`
   * -- tolera fallos individuales (avisa por toast) sin deshacer la creación del lote, que
   * ya quedó guardada. */
  async function uploadStagedImages(loteId: string): Promise<Lote | null> {
    const results = await Promise.allSettled(
      stagedImages.map((item) => uploadLoteImageRequest(remateId, loteId, item.file)),
    );

    const urls: string[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        urls.push(result.value.url);
      } else {
        useToastStore.getState().push('error', normalizeApiError(result.reason).message);
      }
    });

    stagedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    if (urls.length === 0) return null;
    const images: LoteImage[] = urls.map((url, order) => ({ url, order, caption: null }));
    return updateLoteImagesRequest(remateId, loteId, images);
  }

  /** Valida, guarda el lote y -- en creación -- sube las imágenes elegidas. Devuelve
   * `null` si la validación o el guardado fallaron (el error ya queda mostrado en el
   * propio estado del formulario); tanto "Guardar lote" como "Guardar y crear otro"
   * comparten esta lógica y solo difieren en qué hacen con el resultado. */
  async function submitLote(): Promise<Lote | null> {
    const validationErrors = validateLoteForm(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return null;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildLoteFormPayload(values);
      let saved = lote ? await updateLoteRequest(remateId, lote.id, payload) : await createLoteRequest(remateId, payload);

      if (!lote && stagedImages.length > 0) {
        setIsUploadingImages(true);
        const withImages = await uploadStagedImages(saved.id);
        if (withImages) saved = withImages;
      }

      return saved;
    } catch (err) {
      setSubmitError(normalizeApiError(err).message);
      return null;
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  }

  async function handleSubmit() {
    setActiveAction('save');
    const saved = await submitLote();
    setActiveAction(null);
    if (!saved) return;
    onSaved(saved);
    onClose();
  }

  /** "Guardar y crear otro" (solo en creación): igual que `handleSubmit`, pero deja el
   * modal abierto con el formulario limpio para cargar el siguiente lote sin reabrir el
   * modal -- pensado para jornadas donde hay que cargar muchos lotes seguidos. */
  async function handleSubmitAndCreateAnother() {
    setActiveAction('save-and-new');
    const saved = await submitLote();
    setActiveAction(null);
    if (!saved) return;
    onSaved(saved);
    useToastStore.getState().push('success', 'Lote creado. Podés cargar el siguiente.');
    setValues(DEFAULT_LOTE_FORM_VALUES);
    setErrors({});
    setStagedImages([]);
    lotNumberInputRef.current?.focus();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Editar lote' : 'Crear lote'}
      size="xl"
      hideHeader
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">
            {isUploadingImages ? 'Subiendo imágenes…' : 'Podés seguir editando este lote después.'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            {!isEditMode && (
              <Button
                variant="secondary"
                onClick={handleSubmitAndCreateAnother}
                isLoading={activeAction === 'save-and-new'}
                disabled={isSubmitting}
              >
                Guardar y crear otro
              </Button>
            )}
            <motion.div
              whileHover={prefersReducedMotion || isSubmitting ? undefined : { scale: 1.02 }}
              whileTap={prefersReducedMotion || isSubmitting ? undefined : { scale: 0.98 }}
            >
              <Button variant="hero" onClick={handleSubmit} isLoading={activeAction === 'save'} disabled={isSubmitting}>
                {isEditMode ? 'Guardar cambios' : 'Guardar lote'}
                {activeAction !== 'save' && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
              </Button>
            </motion.div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 p-1 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <BoxIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                {isEditMode ? 'Editar lote' : 'Crear lote'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Cargá la información y las fotos del lote. Vas a poder ajustar todo esto después.
              </p>
            </div>
          </div>

          {submitError && <Alert variant="error">{submitError}</Alert>}

          <FormSection title="Información general">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
              <Input
                ref={lotNumberInputRef}
                label="Número de lote"
                value={values.lot_number}
                onChange={(event) => setField('lot_number', event.target.value)}
                error={errors.lot_number}
                required
              />
              <Input
                label="Nombre"
                value={values.title}
                onChange={(event) => setField('title', event.target.value)}
                error={errors.title}
                required
              />
            </div>
            <Select
              label="Categoría"
              value={values.category}
              onChange={(event) => setField('category', event.target.value as LoteFormValues['category'])}
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
          </FormSection>

          <FormSection title="Descripción">
            <Textarea
              label=""
              value={values.description}
              onChange={(event) => setField('description', event.target.value)}
              error={errors.description}
              rows={4}
              placeholder="Contá los detalles relevantes de este lote…"
            />
          </FormSection>

          <FormSection title="Precios">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Precio inicial"
                type="number"
                min={0}
                step="0.01"
                value={values.base_price}
                onChange={(event) => setField('base_price', event.target.value)}
                error={errors.base_price}
                required
              />
              <Input
                label="Incremento mínimo"
                type="number"
                min={0}
                step="0.01"
                value={values.min_increment}
                onChange={(event) => setField('min_increment', event.target.value)}
                error={errors.min_increment}
                required
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
            <p className="-mt-2 text-xs text-ink-faint">
              El precio de reserva nunca se muestra a los compradores -- solo lo ves vos.
            </p>
          </FormSection>

          <FormSection title="Reencolado si queda desierto">
            <Switch
              id={requeuePresetSwitchId}
              label="Preautorizar reencolado"
              description='Si este lote no recibe ofertas, el martillero que esté operando el remate va a poder volver a rematarlo con este precio, sin que vos tengas que estar presente en ese momento.'
              checked={values.requeue_preset_enabled}
              onChange={(checked) => setField('requeue_preset_enabled', checked)}
            />
            {values.requeue_preset_enabled && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Precio inicial de la nueva ronda"
                  type="number"
                  min={0}
                  step="0.01"
                  value={values.requeue_preset_base_price}
                  onChange={(event) => setField('requeue_preset_base_price', event.target.value)}
                  error={errors.requeue_preset_base_price}
                  required
                />
                <Input
                  label="Incremento mínimo de la nueva ronda"
                  type="number"
                  min={0}
                  step="0.01"
                  value={values.requeue_preset_min_increment}
                  onChange={(event) => setField('requeue_preset_min_increment', event.target.value)}
                  error={errors.requeue_preset_min_increment}
                  required
                />
              </div>
            )}
          </FormSection>

          <FormSection title="Imágenes">
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
              <LoteImageStager value={stagedImages} onChange={setStagedImages} />
            )}
          </FormSection>
        </div>

        {!isEditMode && (
          <aside className="flex h-fit flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-5 lg:sticky lg:top-1/2 lg:self-start lg:-translate-y-1/2">
            <div className="flex items-center gap-2 text-brand-700">
              <Lightbulb aria-hidden="true" className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Consejos</h3>
            </div>
            <ul className="flex flex-col gap-2.5">
              {HELP_TIPS.map((tip) => (
                <li key={tip} className="flex gap-2 text-xs leading-relaxed text-brand-900/80">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                  {tip}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </Modal>
  );
}
