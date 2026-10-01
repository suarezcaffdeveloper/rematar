import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, CheckCircle2, Lock, TriangleAlert, X } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Select } from '../../../shared/components/Select';
import { Switch } from '../../../shared/components/Switch';
import { Textarea } from '../../../shared/components/Textarea';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  createLoteRequest,
  updateLoteImagesRequest,
  updateLoteRequest,
  uploadLoteImageRequest,
} from '../../remates/api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../../remates/labels';
import type { Lote, LoteImage } from '../../remates/types';
import {
  DEFAULT_LOTE_FORM_VALUES,
  buildLoteFormPayload,
  loteToFormValues,
  suggestNextLotNumber,
  validateLoteForm,
  type LoteFormErrors,
  type LoteFormValues,
} from '../loteForm';
import { suggestIncrement } from '../preparation';
import { LoteGalleryManager } from './LoteGalleryManager';
import { LoteImageStager, type StagedImage } from './LoteImageStager';
import { LotePreview } from './preparation/LotePreview';

export interface LoteDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  remateId: string;
  currency: string;
  /** Presente en modo edición; ausente en modo creación. */
  lote?: Lote;
  /** Solo lectura (remate en vivo): se ve el lote y su vista previa, pero no se edita nada. */
  readOnly?: boolean;
  /** Números de lote que ya usa el remate, para sugerir el siguiente y avisar de repetidos. */
  existingLotNumbers: string[];
  /** `isNew` es `true` cuando el lote se acaba de crear (no al editar o cambiar sus fotos). */
  onSaved: (lote: Lote, isNew: boolean) => void;
}

type StepId = 'fotos' | 'datos' | 'precios';

const STEPS: Array<{ id: StepId; label: string; description: string; fields: Array<keyof LoteFormErrors> }> = [
  { id: 'fotos', label: 'Fotos', description: 'Sumá las fotos del lote. La primera es la principal.', fields: [] },
  {
    id: 'datos',
    label: 'Datos',
    description: 'Número, nombre y descripción: lo que lee el comprador.',
    fields: ['lot_number', 'title', 'category', 'description'],
  },
  {
    id: 'precios',
    label: 'Precios',
    description: 'Desde dónde se ofertan y cuánto sube cada oferta.',
    fields: ['base_price', 'min_increment', 'reserve_price', 'requeue_preset_base_price', 'requeue_preset_min_increment'],
  },
];

const INCREMENT_PERCENTS = [0.5, 1, 2];

interface CreatedBanner {
  lotNumber: string;
  title: string;
}

/**
 * Panel lateral para crear o editar un lote, en tres pasos cortos -- Fotos, Datos y Precios
 * -- con la vista previa de cómo lo ve el comprador al costado, que se actualiza mientras se
 * completa. Reemplaza al modal de un solo formulario largo (`LoteFormModal`), con las mismas
 * reglas de validación (`validateLoteForm`) más el aviso de número de lote repetido.
 *
 * Imágenes: en modo edición sigue usando `LoteGalleryManager` (sube y persiste en vivo). En
 * creación usa `LoteImageStager` -- staging local, sin red -- y recién sube los archivos
 * DESPUÉS de crear el lote, en el mismo click de guardar (`submitLote`), tolerando fallos
 * individuales sin deshacer la creación.
 *
 * Confirmación de creación: al crear un lote se muestra un cartel fijo dentro del propio
 * panel ("Lote N creado correctamente") -- con "Guardar y cargar otro" es lo que le dice a
 * la empresa que el lote anterior quedó guardado mientras el formulario vuelve a quedar en
 * blanco. Además se avisa por toast (el viewport de toasts queda por encima del panel).
 */
export function LoteDrawer({ isOpen, onClose, remateId, currency, lote, readOnly = false, existingLotNumbers, onSaved }: LoteDrawerProps) {
  const isEditMode = Boolean(lote);
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const requeueSwitchId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<LoteFormValues>(DEFAULT_LOTE_FORM_VALUES);
  const [initialValues, setInitialValues] = useState<LoteFormValues>(DEFAULT_LOTE_FORM_VALUES);
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [activeAction, setActiveAction] = useState<'save' | 'save-and-new' | null>(null);
  const [currentLote, setCurrentLote] = useState<Lote | undefined>(lote);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [savedNumbers, setSavedNumbers] = useState<string[]>([]);
  const [createdBanner, setCreatedBanner] = useState<CreatedBanner | null>(null);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);

  // Se reinicia solo al abrir (o al cambiar de lote): `existingLotNumbers` cambia cada vez
  // que la página recarga los lotes y no tiene que pisar lo que la empresa ya escribió.
  const existingRef = useRef(existingLotNumbers);
  existingRef.current = existingLotNumbers;
  useEffect(() => {
    if (!isOpen) return;
    const initial = lote
      ? loteToFormValues(lote)
      : { ...DEFAULT_LOTE_FORM_VALUES, lot_number: suggestNextLotNumber(existingRef.current) };
    setValues(initial);
    setInitialValues(initial);
    setStepIndex(0);
    setAttempted(new Set());
    setSubmitError(null);
    setCurrentLote(lote);
    setStagedImages([]);
    setSavedNumbers([]);
    setCreatedBanner(null);
    setIsConfirmingClose(false);
  }, [isOpen, lote]);

  useFocusTrap(dialogRef, isOpen);

  // Números que otro lote ya usa: los del remate (menos el propio, al editar) y los que se
  // acaban de guardar con "Guardar y cargar otro" y la página todavía no recargó.
  const takenNumbers = useMemo(() => {
    const own = lote?.lot_number.trim().toLowerCase();
    return [...existingLotNumbers, ...savedNumbers].filter((n) => n.trim().toLowerCase() !== own);
  }, [existingLotNumbers, savedNumbers, lote]);

  const errors = validateLoteForm(values, takenNumbers);
  const isDirty = !readOnly && (stagedImages.length > 0 || JSON.stringify(values) !== JSON.stringify(initialValues));
  const step = STEPS[stepIndex];

  const previewImages = isEditMode
    ? [...(currentLote?.images ?? [])].sort((a, b) => a.order - b.order).map((image) => image.url)
    : stagedImages.map((image) => image.previewUrl);

  function setField<K extends keyof LoteFormValues>(field: K, value: LoteFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function visibleError(field: keyof LoteFormErrors): string | undefined {
    const stepOfField = STEPS.findIndex((s) => s.fields.includes(field));
    return attempted.has(stepOfField) ? errors[field] : undefined;
  }

  function stepHasErrors(index: number): boolean {
    return STEPS[index].fields.some((field) => errors[field]);
  }

  function goTo(index: number) {
    setStepIndex(index);
    setSubmitError(null);
  }

  function handleContinue() {
    if (stepHasErrors(stepIndex)) {
      setAttempted((prev) => new Set(prev).add(stepIndex));
      return;
    }
    goTo(stepIndex + 1);
  }

  function handleStepClick(target: number) {
    if (target > stepIndex && stepHasErrors(stepIndex)) {
      setAttempted((prev) => new Set(prev).add(stepIndex));
      return;
    }
    goTo(target);
  }

  function requestClose() {
    if (isSubmitting) return;
    if (isDirty && !isConfirmingClose) {
      setIsConfirmingClose(true);
      return;
    }
    onClose();
  }

  // Foco inicial en el panel y scroll del fondo bloqueado: solo al abrir -- si dependieran de
  // `isDirty`, el foco volvería al panel después de la primera letra tipeada.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isDirty, isConfirmingClose, isSubmitting]);

  /** Sube cada imagen elegida antes de guardar y persiste el orden final en un único `PATCH`
   * -- tolera fallos individuales (avisa por toast) sin deshacer la creación del lote. */
  async function uploadStagedImages(loteId: string): Promise<Lote | null> {
    const results = await Promise.allSettled(stagedImages.map((item) => uploadLoteImageRequest(remateId, loteId, item.file)));
    const urls: string[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') urls.push(result.value.url);
      else useToastStore.getState().push('error', normalizeApiError(result.reason).message);
    });
    stagedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    if (urls.length === 0) return null;
    const images: LoteImage[] = urls.map((url, order) => ({ url, order, caption: null }));
    return updateLoteImagesRequest(remateId, loteId, images);
  }

  /** Valida todo, guarda el lote y -- en creación -- sube las fotos. `null` si algo falló
   * (el paso con el error queda abierto y marcado). */
  async function submitLote(): Promise<Lote | null> {
    const firstInvalid = STEPS.findIndex((_, index) => stepHasErrors(index));
    if (firstInvalid !== -1) {
      setAttempted(new Set(STEPS.map((_, index) => index)));
      goTo(firstInvalid);
      return null;
    }
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

  async function handleSave() {
    setActiveAction('save');
    const saved = await submitLote();
    setActiveAction(null);
    if (!saved) return;
    useToastStore.getState().push('success', isEditMode ? `Lote ${saved.lot_number} guardado.` : `Lote ${saved.lot_number} creado correctamente.`);
    onSaved(saved, !isEditMode);
    onClose();
  }

  /** "Guardar y cargar otro" (solo en creación): deja el panel abierto con el formulario
   * limpio y un cartel que confirma el lote recién guardado. */
  async function handleSaveAndNew() {
    setActiveAction('save-and-new');
    const saved = await submitLote();
    setActiveAction(null);
    if (!saved) return;
    const nextNumbers = [...savedNumbers, saved.lot_number];
    useToastStore.getState().push('success', `Lote ${saved.lot_number} creado correctamente.`);
    onSaved(saved, true);
    setSavedNumbers(nextNumbers);
    setCreatedBanner({ lotNumber: saved.lot_number, title: saved.title });
    const next = { ...DEFAULT_LOTE_FORM_VALUES, lot_number: suggestNextLotNumber([...existingLotNumbers, ...nextNumbers]) };
    setValues(next);
    setInitialValues(next);
    setStagedImages([]);
    setAttempted(new Set());
    setStepIndex(0);
    const body = dialogRef.current?.querySelector<HTMLElement>('[data-drawer-body]');
    if (body) body.scrollTop = 0;
  }

  if (!isOpen) return null;

  const isLast = stepIndex === STEPS.length - 1;
  const title = isEditMode ? `Lote ${lote?.lot_number}` : 'Nuevo lote';
  const subtitle = readOnly ? 'Solo lectura: el remate está en vivo.' : step.description;
  const incrementOptions = INCREMENT_PERCENTS.map((percent) => ({ percent, value: suggestIncrement(values.base_price, percent) }));

  return createPortal(
    // `z-[45]`: por debajo del viewport de toasts (`z-50`), así el aviso de "lote creado" se
    // ve por encima del panel; por encima de la barra superior (`z-40`).
    <div className="fixed inset-0 z-[45]">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={requestClose}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[66rem] flex-col bg-white font-display text-ink shadow-[-30px_0_80px_-30px_rgba(16,17,20,0.5)] focus:outline-none"
        initial={prefersReducedMotion ? false : { x: 48, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="flex items-start justify-between gap-4 px-4 pb-3 pt-5 sm:px-7">
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        {!readOnly && (
          <nav aria-label="Pasos del lote" className="flex gap-1 overflow-x-auto border-b border-line px-4 pb-3 sm:px-7">
            {STEPS.map((item, index) => {
              const done = index < stepIndex && !stepHasErrors(index);
              const current = index === stepIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleStepClick(index)}
                  aria-current={current ? 'step' : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    current ? 'bg-surface-subtle text-ink shadow-[0_0_0_1px_var(--color-line)]' : 'text-ink-muted hover:bg-surface-subtle'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      done ? 'border-ink bg-ink text-white' : current ? 'border-brand-600 text-brand-600' : 'border-line-strong'
                    }`}
                  >
                    {done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div data-drawer-body className="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-7">
            <AnimatePresence initial={false}>
              {createdBanner && (
                <motion.div
                  key="created"
                  role="status"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3 rounded-2xl bg-success-50 px-4 py-3 text-success-700"
                >
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="flex-1 text-sm">
                    <b>Lote {createdBanner.lotNumber} creado correctamente.</b> “{createdBanner.title}” ya está en tu catálogo. Podés cargar el siguiente.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreatedBanner(null)}
                    aria-label="Cerrar aviso"
                    className="rounded-full p-1 text-success-700/70 hover:bg-success-100 hover:text-success-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-success-600"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {submitError && <Alert variant="error">{submitError}</Alert>}

            {readOnly ? (
              <p className="text-sm text-ink-muted">Mirá a la derecha cómo se muestra este lote a los compradores.</p>
            ) : (
              <motion.div
                key={step.id}
                initial={prefersReducedMotion ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-4"
              >
                {step.id === 'fotos' &&
                  (currentLote ? (
                    <LoteGalleryManager
                      remateId={remateId}
                      lote={currentLote}
                      onChanged={(updated) => {
                        setCurrentLote(updated);
                        onSaved(updated, false);
                      }}
                    />
                  ) : (
                    <>
                      <LoteImageStager value={stagedImages} onChange={setStagedImages} />
                      {stagedImages.length === 0 && (
                        <p className="text-sm text-ink-muted">
                          Podés cargar el lote sin fotos y sumarlas después, pero los lotes con fotos reciben más ofertas.
                        </p>
                      )}
                    </>
                  ))}

                {step.id === 'datos' && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
                      <Input
                        label="Número de lote"
                        value={values.lot_number}
                        onChange={(event) => setField('lot_number', event.target.value)}
                        error={visibleError('lot_number')}
                        maxLength={20}
                        required
                      />
                      <Input
                        label="Nombre"
                        value={values.title}
                        onChange={(event) => setField('title', event.target.value)}
                        error={visibleError('title')}
                        placeholder="Ej.: 60 novillos Angus, 380 kg"
                        required
                      />
                    </div>
                    <Select
                      label="Categoría"
                      value={values.category}
                      onChange={(event) => setField('category', event.target.value as LoteFormValues['category'])}
                      error={visibleError('category')}
                      required
                    >
                      <option value="">Elegir…</option>
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </Select>
                    <div className="flex flex-col gap-1.5">
                      <Textarea
                        label="Descripción"
                        value={values.description}
                        onChange={(event) => setField('description', event.target.value)}
                        error={visibleError('description')}
                        rows={5}
                        maxLength={5000}
                        placeholder="Contá los detalles relevantes: edad, sanidad, condiciones de entrega…"
                      />
                      <span className="self-end text-xs tabular-nums text-ink-faint">{values.description.length} / 5000</span>
                    </div>
                  </>
                )}

                {step.id === 'precios' && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Precio inicial"
                        type="number"
                        min={0}
                        step="0.01"
                        value={values.base_price}
                        onChange={(event) => setField('base_price', event.target.value)}
                        error={visibleError('base_price')}
                        required
                      />
                      <div>
                        <Input
                          label="Incremento mínimo"
                          type="number"
                          min={0}
                          step="0.01"
                          value={values.min_increment}
                          onChange={(event) => setField('min_increment', event.target.value)}
                          error={visibleError('min_increment')}
                          required
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                          Sugerido:
                          {incrementOptions.map(({ percent, value }) => (
                            <button
                              key={percent}
                              type="button"
                              disabled={!value}
                              onClick={() => value && setField('min_increment', value)}
                              className="rounded-full border border-line-strong bg-white px-2.5 py-0.5 font-semibold transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {percent}% del precio
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <Input
                        label="Precio de reserva (opcional)"
                        type="number"
                        min={0}
                        step="0.01"
                        value={values.reserve_price}
                        onChange={(event) => setField('reserve_price', event.target.value)}
                        error={visibleError('reserve_price')}
                      />
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                        <Lock aria-hidden="true" className="h-3 w-3" />
                        Por debajo de este precio el lote no se vende. Solo lo ves vos: los compradores no lo ven.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
                      <Switch
                        id={requeueSwitchId}
                        label="Preautorizar reencolado"
                        description="Si este lote no recibe ofertas, el martillero que esté operando el remate va a poder volver a rematarlo con este precio, sin que vos tengas que estar presente en ese momento."
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
                            error={visibleError('requeue_preset_base_price')}
                            required
                          />
                          <Input
                            label="Incremento mínimo de la nueva ronda"
                            type="number"
                            min={0}
                            step="0.01"
                            value={values.requeue_preset_min_increment}
                            onChange={(event) => setField('requeue_preset_min_increment', event.target.value)}
                            error={visibleError('requeue_preset_min_increment')}
                            required
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </div>

          <aside className="hidden min-h-0 overflow-y-auto border-l border-line bg-surface-subtle px-6 py-5 lg:block">
            <h3 className="mb-3 text-xs font-bold text-ink-muted">Así lo ven los compradores</h3>
            <LotePreview
              lotNumber={values.lot_number}
              category={values.category}
              title={values.title}
              description={values.description}
              basePrice={values.base_price}
              minIncrement={values.min_increment}
              currency={currency}
              images={previewImages}
            />
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5 sm:px-7">
          {readOnly ? (
            <>
              <span />
              <Button variant="hero" onClick={onClose}>
                Cerrar
              </Button>
            </>
          ) : isConfirmingClose ? (
            <div role="alertdialog" aria-label="Descartar cambios" className="flex w-full flex-wrap items-center gap-3 rounded-2xl bg-danger-50 px-4 py-2.5 text-sm text-danger-700">
              <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="flex-1">Tenés cambios sin guardar. ¿Querés descartarlos?</span>
              <Button variant="secondary" onClick={() => setIsConfirmingClose(false)}>
                Seguir editando
              </Button>
              <Button variant="danger" onClick={onClose}>
                Descartar
              </Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={() => (stepIndex === 0 ? requestClose() : goTo(stepIndex - 1))} disabled={isSubmitting}>
                {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                {isUploadingImages && <span className="text-xs text-ink-muted">Subiendo imágenes…</span>}
                {isLast ? (
                  <>
                    {!isEditMode && (
                      <Button variant="secondary" onClick={() => void handleSaveAndNew()} isLoading={activeAction === 'save-and-new'} disabled={isSubmitting}>
                        Guardar y cargar otro
                      </Button>
                    )}
                    <Button variant="hero" onClick={() => void handleSave()} isLoading={activeAction === 'save'} disabled={isSubmitting}>
                      {isEditMode ? 'Guardar cambios' : 'Guardar lote'}
                      {activeAction !== 'save' && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                    </Button>
                  </>
                ) : (
                  <Button variant="hero" onClick={handleContinue}>
                    Continuar
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
