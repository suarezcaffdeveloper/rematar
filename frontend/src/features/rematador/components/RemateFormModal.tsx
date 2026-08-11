import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { Switch } from '../../../shared/components/Switch';
import { Textarea } from '../../../shared/components/Textarea';
import { GavelIcon } from '../../remates/components/icons';
import { createRemateRequest, updateRemateRequest } from '../../remates/api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { FormSection } from './FormSection';
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

const DESCRIPTION_MAX_LENGTH = 5000;
const COMMON_CURRENCIES = ['ARS', 'USD', 'EUR', 'UYU', 'BRL'];
const REVEAL_TRANSITION = { duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] as const };

const HELP_TIPS = [
  'Podrás agregar los lotes después de crear el remate.',
  'La imagen seleccionada será la portada del remate.',
  'El horario final se determina automáticamente cuando termina el último lote.',
  'Estas configuraciones podrán modificarse antes de iniciar el remate.',
];

/**
 * Formulario de Remate, crear y editar (Épica 5, Módulo 5.3; rediseño visual del modo
 * creación -- Épica 9). Valida en el cliente (`validateRemateForm`) antes de llamar al
 * backend -- si igual llega un error de negocio (por ejemplo, el remate dejó de estar
 * en `draft`/`scheduled` mientras el modal estaba abierto), se muestra en un `Alert`
 * dentro del propio modal, sin cerrarlo, para que el usuario no pierda lo que ya
 * completó.
 *
 * El campo "fecha y hora de fin estimada" se sacó de la UI (no tiene sentido funcional:
 * el remate termina cuando termina el último lote) sin tocar `remateForm.ts` -- en modo
 * edición, un remate que ya tuviera `ends_at` cargado de antes simplemente viaja de
 * vuelta sin cambios al guardar.
 */
export function RemateFormModal({ isOpen, onClose, remate, onSaved }: RemateFormModalProps) {
  const isEditMode = Boolean(remate);
  const [values, setValues] = useState<RemateFormValues>(DEFAULT_REMATE_FORM_VALUES);
  const [errors, setErrors] = useState<ReturnType<typeof validateRemateForm>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const antiSnipingSwitchId = useId();
  const loteTimerSwitchId = useId();

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

  const revealTransition = prefersReducedMotion ? { duration: 0 } : REVEAL_TRANSITION;
  const currencyOptions = COMMON_CURRENCIES.includes(values.currency.toUpperCase())
    ? COMMON_CURRENCIES
    : [...COMMON_CURRENCIES, values.currency.toUpperCase()].filter(Boolean);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Editar remate' : 'Crear nuevo remate'}
      size="xl"
      hideHeader
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {isEditMode ? 'Los cambios se guardan de inmediato.' : 'El siguiente paso será cargar los lotes.'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <motion.div
              whileHover={prefersReducedMotion || isSubmitting ? undefined : { scale: 1.02 }}
              whileTap={prefersReducedMotion || isSubmitting ? undefined : { scale: 0.98 }}
            >
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25 hover:from-brand-700 hover:to-brand-800 hover:shadow-xl hover:shadow-brand-600/30"
              >
                {isEditMode ? 'Guardar cambios' : 'Crear remate'}
                {!isSubmitting && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
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
              <GavelIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {isEditMode ? 'Editar remate' : 'Crear nuevo remate'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Configure la información general del remate. Luego podrá agregar los lotes y comenzar la
                subasta cuando lo desee.
              </p>
            </div>
          </div>

          {submitError && <Alert variant="error">{submitError}</Alert>}

          <FormSection title="Información general">
            <Input
              label="Título"
              value={values.title}
              onChange={(event) => setField('title', event.target.value)}
              error={errors.title}
              required
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Input
                label="Ubicación"
                value={values.location}
                onChange={(event) => setField('location', event.target.value)}
                error={errors.location}
              />
            </div>
          </FormSection>

          <FormSection title="Descripción">
            <div className="flex flex-col gap-1.5">
              <Textarea
                label="Descripción"
                value={values.description}
                onChange={(event) => setField('description', event.target.value)}
                error={errors.description}
                rows={5}
                maxLength={DESCRIPTION_MAX_LENGTH}
                placeholder="Contá a los compradores qué van a encontrar en este remate: contexto, condiciones y detalles relevantes…"
              />
              <span className="self-end text-xs text-slate-400">
                {values.description.length} / {DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </FormSection>

          <FormSection title="Imagen de portada">
            <RemateCoverImageField
              value={values.cover_image_url}
              onChange={(url) => setField('cover_image_url', url)}
              error={errors.cover_image_url}
            />
          </FormSection>

          <FormSection title="Fecha del remate">
            <Input
              label="Fecha y hora de inicio"
              type="datetime-local"
              value={values.starts_at}
              onChange={(event) => setField('starts_at', event.target.value)}
              error={errors.starts_at}
            />
            <p className="-mt-2 text-xs text-slate-400">
              La fecha de inicio hace falta para publicar el remate más adelante -- no es obligatoria para
              guardarlo como borrador.
            </p>
          </FormSection>

          <FormSection title="Configuración">
            <Select
              label="Moneda"
              value={values.currency}
              onChange={(event) => setField('currency', event.target.value)}
              error={errors.currency}
            >
              {currencyOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
              <Switch
                id={antiSnipingSwitchId}
                label="Habilitar anti-sniping"
                description="Extiende automáticamente el tiempo cuando se reciben ofertas durante los últimos segundos del temporizador."
                checked={values.anti_sniping_enabled}
                onChange={(checked) => setField('anti_sniping_enabled', checked)}
              />
              <AnimatePresence initial={false}>
                {values.anti_sniping_enabled && (
                  <motion.div
                    key="anti-sniping-seconds"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={revealTransition}
                    className="overflow-hidden"
                  >
                    <Input
                      label="Segundos de extensión ante una oferta de último momento"
                      type="number"
                      min={10}
                      max={600}
                      value={values.anti_sniping_extension_seconds}
                      onChange={(event) => setField('anti_sniping_extension_seconds', event.target.value)}
                      error={errors.anti_sniping_extension_seconds}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
              <Switch
                id={loteTimerSwitchId}
                label="Habilitar cuenta regresiva por lote"
                description="Cada lote iniciará con una cuenta regresiva configurable."
                checked={values.lote_timer_enabled}
                onChange={(checked) => setField('lote_timer_enabled', checked)}
              />
              <AnimatePresence initial={false}>
                {values.lote_timer_enabled && (
                  <motion.div
                    key="lote-timer-seconds"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={revealTransition}
                    className="overflow-hidden"
                  >
                    <Input
                      label="Segundos de cuenta regresiva al abrir cada lote"
                      type="number"
                      min={5}
                      max={3600}
                      value={values.lote_timer_seconds}
                      onChange={(event) => setField('lote_timer_seconds', event.target.value)}
                      error={errors.lote_timer_seconds}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </FormSection>
        </div>

        {!isEditMode && (
          <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
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
