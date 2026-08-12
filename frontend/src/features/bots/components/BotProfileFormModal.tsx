import { useEffect, useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { Switch } from '../../../shared/components/Switch';
import { createBotProfileRequest, updateBotProfileRequest } from '../api';
import { PERSONALITY_DESCRIPTIONS, PERSONALITY_LABELS } from '../labels';
import type { BotPersonality, BotProfile, BotProfileFormPayload } from '../types';

export interface BotProfileFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Presente en modo edición; ausente en modo creación. */
  bot?: BotProfile;
  onSaved: (bot: BotProfile) => void;
}

interface FormValues {
  display_name: string;
  personality: BotPersonality;
  max_budget: string;
  reaction_delay_min_seconds: string;
  reaction_delay_max_seconds: string;
  continue_probability: string;
  participates_in_chat: boolean;
  chat_message_frequency: string;
  is_active: boolean;
}

const DEFAULT_VALUES: FormValues = {
  display_name: '',
  personality: 'competitive',
  max_budget: '',
  reaction_delay_min_seconds: '2',
  reaction_delay_max_seconds: '5',
  continue_probability: '0.70',
  participates_in_chat: false,
  chat_message_frequency: '0.30',
  is_active: true,
};

function botToFormValues(bot: BotProfile): FormValues {
  return {
    display_name: bot.display_name,
    personality: bot.personality,
    max_budget: bot.max_budget,
    reaction_delay_min_seconds: String(bot.reaction_delay_min_seconds),
    reaction_delay_max_seconds: String(bot.reaction_delay_max_seconds),
    continue_probability: bot.continue_probability,
    participates_in_chat: bot.participates_in_chat,
    chat_message_frequency: bot.chat_message_frequency,
    is_active: bot.is_active,
  };
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.display_name.trim()) errors.display_name = 'Ingresá un nombre visible.';

  const maxBudget = Number(values.max_budget);
  if (!values.max_budget.trim() || !Number.isFinite(maxBudget) || maxBudget <= 0) {
    errors.max_budget = 'Ingresá un presupuesto máximo mayor a cero.';
  }

  const min = Number(values.reaction_delay_min_seconds);
  const max = Number(values.reaction_delay_max_seconds);
  if (!Number.isFinite(min) || min <= 0) {
    errors.reaction_delay_min_seconds = 'Tiene que ser mayor a cero.';
  } else if (!Number.isFinite(max) || max < min) {
    errors.reaction_delay_max_seconds = 'Tiene que ser mayor o igual al tiempo mínimo.';
  }

  const continueProbability = Number(values.continue_probability);
  if (!Number.isFinite(continueProbability) || continueProbability < 0 || continueProbability > 1) {
    errors.continue_probability = 'Ingresá un valor entre 0 y 1.';
  }

  if (values.participates_in_chat) {
    const chatFrequency = Number(values.chat_message_frequency);
    if (!Number.isFinite(chatFrequency) || chatFrequency < 0 || chatFrequency > 1) {
      errors.chat_message_frequency = 'Ingresá un valor entre 0 y 1.';
    }
  }

  return errors;
}

function buildPayload(values: FormValues): BotProfileFormPayload {
  return {
    display_name: values.display_name.trim(),
    personality: values.personality,
    max_budget: values.max_budget,
    reaction_delay_min_seconds: Number(values.reaction_delay_min_seconds),
    reaction_delay_max_seconds: Number(values.reaction_delay_max_seconds),
    continue_probability: values.continue_probability,
    participates_in_chat: values.participates_in_chat,
    chat_message_frequency: values.chat_message_frequency,
    is_active: values.is_active,
  };
}

/**
 * Formulario de bot simulador, crear y editar -- mismo lenguaje visual que
 * `LoteFormModal`/`RemateFormModal` (Input/Select/Switch/Modal ya compartidos), pero sin
 * ningún manejo de imágenes: un bot no tiene galería.
 */
export function BotProfileFormModal({ isOpen, onClose, bot, onSaved }: BotProfileFormModalProps) {
  const isEditMode = Boolean(bot);
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(bot ? botToFormValues(bot) : DEFAULT_VALUES);
    setErrors({});
    setSubmitError(null);
  }, [isOpen, bot]);

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validate(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildPayload(values);
      const saved = bot ? await updateBotProfileRequest(bot.id, payload) : await createBotProfileRequest(payload);
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
      title={isEditMode ? 'Editar simulador' : 'Crear simulador'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            {isEditMode ? 'Guardar cambios' : 'Crear simulador'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {submitError && <Alert variant="error">{submitError}</Alert>}

        <Input
          label="Nombre visible"
          value={values.display_name}
          onChange={(event) => setField('display_name', event.target.value)}
          error={errors.display_name}
          placeholder="Bot Competitivo"
          required
        />

        <Select
          label="Personalidad"
          value={values.personality}
          onChange={(event) => setField('personality', event.target.value as BotPersonality)}
          required
        >
          {(Object.keys(PERSONALITY_LABELS) as BotPersonality[]).map((personality) => (
            <option key={personality} value={personality}>
              {PERSONALITY_LABELS[personality]}
            </option>
          ))}
        </Select>
        <p className="-mt-3 text-xs text-slate-400">{PERSONALITY_DESCRIPTIONS[values.personality]}</p>

        <Input
          label="Presupuesto máximo"
          type="number"
          min={0}
          step="0.01"
          value={values.max_budget}
          onChange={(event) => setField('max_budget', event.target.value)}
          error={errors.max_budget}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Reacción mínima (seg.)"
            type="number"
            min={1}
            step="1"
            value={values.reaction_delay_min_seconds}
            onChange={(event) => setField('reaction_delay_min_seconds', event.target.value)}
            error={errors.reaction_delay_min_seconds}
            required
          />
          <Input
            label="Reacción máxima (seg.)"
            type="number"
            min={1}
            step="1"
            value={values.reaction_delay_max_seconds}
            onChange={(event) => setField('reaction_delay_max_seconds', event.target.value)}
            error={errors.reaction_delay_max_seconds}
            required
          />
        </div>

        <Input
          label="Probabilidad de seguir ofertando (0 a 1)"
          type="number"
          min={0}
          max={1}
          step="0.05"
          value={values.continue_probability}
          onChange={(event) => setField('continue_probability', event.target.value)}
          error={errors.continue_probability}
          required
        />

        <Switch
          id="bot-participates-in-chat"
          checked={values.participates_in_chat}
          onChange={(checked) => setField('participates_in_chat', checked)}
          label="Participa en el chat"
          description="Si está activo, el bot puede enviar mensajes relacionados con la dinámica del remate."
        />

        {values.participates_in_chat && (
          <Input
            label="Frecuencia de mensajes (0 a 1)"
            type="number"
            min={0}
            max={1}
            step="0.05"
            value={values.chat_message_frequency}
            onChange={(event) => setField('chat_message_frequency', event.target.value)}
            error={errors.chat_message_frequency}
          />
        )}

        {isEditMode && (
          <Switch
            id="bot-is-active"
            checked={values.is_active}
            onChange={(checked) => setField('is_active', checked)}
            label="Simulador activo"
            description="Un simulador inactivo no se puede seleccionar para nuevas simulaciones."
          />
        )}
      </div>
    </Modal>
  );
}
