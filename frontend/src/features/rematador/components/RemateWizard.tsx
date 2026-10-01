import { useEffect, useId, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Globe, Info, Lock, Radio, Timer, TriangleAlert } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Modal } from '../../../shared/components/Modal';
import { Select } from '../../../shared/components/Select';
import { Switch } from '../../../shared/components/Switch';
import { Textarea } from '../../../shared/components/Textarea';
import { createRemateRequest } from '../../remates/api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import {
  DEFAULT_REMATE_FORM_VALUES,
  buildRemateFormPayload,
  validateRemateForm,
  type RemateFormErrors,
  type RemateFormValues,
} from '../remateForm';
import { RemateCoverImageField } from './RemateCoverImageField';

export interface RemateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (remate: Remate) => void;
}

const DESCRIPTION_MAX_LENGTH = 5000;
const COMMON_CURRENCIES = ['ARS', 'USD', 'EUR', 'UYU', 'BRL'];

type StepId = 'modalidad' | 'datos' | 'fechas' | 'garantia' | 'revisar';

interface StepDefinition {
  id: StepId;
  label: string;
  title: string;
  description: string;
  /** Qué campos de `RemateFormValues` valida este paso antes de dejar avanzar. */
  fields: Array<keyof RemateFormValues>;
}

const STEPS: StepDefinition[] = [
  {
    id: 'modalidad',
    label: 'Modalidad',
    title: '¿Cómo querés que sea el remate?',
    description: 'Elegí la modalidad y quién puede entrar. No se puede cambiar después de crearlo.',
    fields: [],
  },
  {
    id: 'datos',
    label: 'Datos',
    title: 'Contá de qué se trata',
    description: 'Es lo primero que ve el comprador: título, rubro, portada y descripción.',
    fields: ['title', 'category', 'location', 'description', 'cover_image_url'],
  },
  {
    id: 'fechas',
    label: 'Fechas',
    title: '¿Cuándo es?',
    description: 'Las fechas ordenan todo: cuándo se anuncia el remate y cuándo abre.',
    fields: ['starts_at', 'ends_at', 'currency', 'timed_extension_window_seconds', 'timed_extension_duration_seconds'],
  },
  {
    id: 'garantia',
    label: 'Garantía',
    title: 'Garantía económica',
    description: 'Un respaldo para que solo oferten quienes de verdad quieren comprar.',
    fields: ['guarantee_amount'],
  },
  {
    id: 'revisar',
    label: 'Revisar',
    title: 'Revisá y creá el remate',
    description: 'Se crea como borrador: nadie lo ve hasta que lo publiques.',
    fields: [],
  },
];

const AUCTION_OPTIONS = [
  {
    value: 'live' as const,
    icon: Radio,
    label: 'Remate en vivo',
    description: 'El rematador abre un lote a la vez y los compradores ofertan en tiempo real.',
    points: ['Necesita un rematador operador', 'Se puede sumar transmisión de video', 'Empieza cuando el rematador lo inicia'],
  },
  {
    value: 'timed' as const,
    icon: Timer,
    label: 'Timed Auction',
    description: 'Todos los lotes reciben ofertas a la vez entre dos fechas y cierran solos.',
    points: ['No necesita rematador en sala', 'Arranca y cierra automáticamente', 'Puede extender el cierre si ofertan al final'],
  },
];

const ACCESS_OPTIONS = [
  {
    value: 'public' as const,
    icon: Globe,
    label: 'Público',
    description: 'Cualquier comprador registrado lo ve en el listado y puede participar.',
  },
  {
    value: 'private' as const,
    icon: Lock,
    label: 'Privado',
    description: 'No aparece en el listado. Solo entra quien reciba el código que compartís vos.',
  },
];

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return `${currency.trim().toUpperCase()} ${amount.toLocaleString('es-AR')}`;
}

function formatLocalDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Asistente de creación de remate, paso a paso (rediseño del panel de la empresa). Reemplaza
 * al modal de un solo formulario largo por cinco pasos cortos -- modalidad, datos, fechas,
 * garantía y revisión -- con una lista de avance a la izquierda y la explicación de cada
 * campo al lado del campo. Valida por paso (mismas reglas que `validateRemateForm`, sin
 * duplicarlas) y no deja avanzar con un paso inválido.
 *
 * Crear siempre deja el remate en `draft`: los lotes (y el video) se cargan en la pantalla
 * siguiente, `LotesManagementPage`, porque necesitan que el remate ya exista. El último paso
 * lo dice explícitamente. La edición de un remate existente sigue yendo por
 * `RemateFormModal`.
 */
export function RemateWizard({ isOpen, onClose, onCreated }: RemateWizardProps) {
  const [values, setValues] = useState<RemateFormValues>(DEFAULT_REMATE_FORM_VALUES);
  const [stepIndex, setStepIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reduceMotion = useReducedMotion();
  const antiSnipingSwitchId = useId();
  const guaranteeSwitchId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setValues(DEFAULT_REMATE_FORM_VALUES);
    setStepIndex(0);
    setVisited(new Set([0]));
    setAttempted(new Set());
    setSubmitError(null);
  }, [isOpen]);

  const errors = validateRemateForm(values);
  const isTimed = values.auction_type === 'timed';
  const step = STEPS[stepIndex];

  function setField<K extends keyof RemateFormValues>(field: K, value: RemateFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function stepErrors(index: number): RemateFormErrors {
    const result: RemateFormErrors = {};
    for (const field of STEPS[index].fields) {
      const message = errors[field];
      if (message) result[field] = message;
    }
    return result;
  }

  function stepHasErrors(index: number): boolean {
    return Object.keys(stepErrors(index)).length > 0;
  }

  function goTo(index: number) {
    setStepIndex(index);
    setVisited((prev) => new Set(prev).add(index));
  }

  function handleContinue() {
    if (stepHasErrors(stepIndex)) {
      setAttempted((prev) => new Set(prev).add(stepIndex));
      return;
    }
    goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  }

  async function handleCreate() {
    const firstInvalid = STEPS.findIndex((_, index) => stepHasErrors(index));
    if (firstInvalid !== -1) {
      setAttempted(new Set(STEPS.map((_, index) => index)));
      goTo(firstInvalid);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createRemateRequest(buildRemateFormPayload(values));
      onCreated(created);
      onClose();
    } catch (err) {
      setSubmitError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function visibleErrors(index: number): RemateFormErrors {
    return attempted.has(index) ? stepErrors(index) : {};
  }

  const completedCount = STEPS.slice(0, -1).filter((_, index) => visited.has(index) && index < stepIndex && !stepHasErrors(index)).length;
  const progress = Math.round((completedCount / (STEPS.length - 1)) * 100);
  const currencyOptions = COMMON_CURRENCIES.includes(values.currency.toUpperCase())
    ? COMMON_CURRENCIES
    : [...COMMON_CURRENCIES, values.currency.toUpperCase()].filter(Boolean);
  const stepErr = visibleErrors(stepIndex);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Crear remate"
      size="xl"
      hideHeader
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => (stepIndex === 0 ? onClose() : goTo(stepIndex - 1))} disabled={isSubmitting}>
            {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {step.id === 'revisar' ? (
            <Button variant="hero" onClick={() => void handleCreate()} isLoading={isSubmitting}>
              Crear remate
              {!isSubmitting && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </Button>
          ) : (
            <Button variant="hero" onClick={handleContinue}>
              Continuar
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 p-1 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside aria-label="Pasos para crear el remate" className="flex flex-col gap-4 md:border-r md:border-line md:pr-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Crear remate</h1>
            <p className="mt-1 hidden text-sm text-ink-muted md:block">Seguí los pasos. Tu avance se ve acá.</p>
          </div>
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
              <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {completedCount} de {STEPS.length - 1} pasos listos
            </p>
          </div>
          <ol className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
            {STEPS.map((item, index) => {
              const done = index < stepIndex && visited.has(index) && !stepHasErrors(index);
              const current = index === stepIndex;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={current ? 'step' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      current ? 'bg-surface-subtle shadow-[0_0_0_1px_var(--color-line)]' : 'hover:bg-surface-subtle'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                        done
                          ? 'border-ink bg-ink text-white'
                          : current
                            ? 'border-brand-600 text-brand-600'
                            : 'border-line-strong text-ink-faint'
                      }`}
                    >
                      {done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="text-sm font-semibold text-ink">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="min-w-0">
          <motion.div
            key={step.id}
            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-5"
          >
            <div className="pr-8">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink">{step.title}</h2>
              <p className="mt-1 max-w-[58ch] text-sm text-ink-muted">{step.description}</p>
            </div>

            {submitError && <Alert variant="error">{submitError}</Alert>}

            {step.id === 'modalidad' && (
              <>
                <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Modalidad del remate</legend>
                  {AUCTION_OPTIONS.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      name="auction_type"
                      selected={values.auction_type === option.value}
                      onSelect={() => setField('auction_type', option.value)}
                      icon={<option.icon aria-hidden="true" className="h-5 w-5" />}
                      label={option.label}
                      description={option.description}
                      points={option.points}
                      value={option.value}
                    />
                  ))}
                </fieldset>
                <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-ink">¿Quién puede entrar?</legend>
                  {ACCESS_OPTIONS.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      name="access_type"
                      selected={values.access_type === option.value}
                      onSelect={() => setField('access_type', option.value)}
                      icon={<option.icon aria-hidden="true" className="h-5 w-5" />}
                      label={option.label}
                      description={option.description}
                      value={option.value}
                    />
                  ))}
                </fieldset>
              </>
            )}

            {step.id === 'datos' && (
              <div className="flex flex-col gap-4">
                <Input
                  label="Título"
                  value={values.title}
                  onChange={(event) => setField('title', event.target.value)}
                  error={stepErr.title}
                  placeholder="Ej.: Gran remate de hacienda · Cañuelas"
                  required
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    label="Categoría"
                    value={values.category}
                    onChange={(event) => setField('category', event.target.value as RemateFormValues['category'])}
                    error={stepErr.category}
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
                    error={stepErr.location}
                    placeholder={isTimed ? 'Online' : 'Predio o ciudad'}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Textarea
                    label="Descripción"
                    value={values.description}
                    onChange={(event) => setField('description', event.target.value)}
                    error={stepErr.description}
                    rows={4}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    placeholder="Condiciones de venta, cómo se retiran los bienes, comisión…"
                  />
                  <span className="self-end text-xs text-ink-faint">
                    {values.description.length} / {DESCRIPTION_MAX_LENGTH}
                  </span>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">Portada</p>
                  <RemateCoverImageField
                    value={values.cover_image_url}
                    onChange={(url) => setField('cover_image_url', url)}
                    error={stepErr.cover_image_url}
                  />
                  <p className="mt-1.5 text-xs text-ink-faint">Si no subís una, armamos la portada con las fotos de tus lotes.</p>
                </div>
              </div>
            )}

            {step.id === 'fechas' && (
              <div className="flex flex-col gap-4">
                <Callout>
                  {isTimed
                    ? 'En Timed no hace falta iniciarlo: arranca solo en la fecha de inicio y cierra en la de cierre.'
                    : 'En un remate en vivo la fecha es la hora prevista. Quien inicia la sala es el rematador. La de fin no se carga: termina cuando cierra el último lote.'}
                </Callout>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Fecha y hora de inicio"
                    type="datetime-local"
                    value={values.starts_at}
                    onChange={(event) => setField('starts_at', event.target.value)}
                    error={stepErr.starts_at}
                    required={isTimed}
                  />
                  {isTimed && (
                    <Input
                      label="Fecha y hora de cierre"
                      type="datetime-local"
                      value={values.ends_at}
                      onChange={(event) => setField('ends_at', event.target.value)}
                      error={stepErr.ends_at}
                      required
                    />
                  )}
                  <Select
                    label="Moneda"
                    value={values.currency}
                    onChange={(event) => setField('currency', event.target.value)}
                    error={stepErr.currency}
                  >
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </Select>
                </div>
                {!isTimed && (
                  <p className="text-xs text-ink-faint">
                    La fecha de inicio no es obligatoria para guardar el borrador, pero hace falta para publicarlo.
                  </p>
                )}
                {isTimed && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
                    <Switch
                      id={antiSnipingSwitchId}
                      label="Extender el cierre si ofertan al final"
                      description="Evita que alguien gane ofertando en el último segundo: una oferta cerca del cierre de un lote suma tiempo a ESE lote, nunca a los demás."
                      checked={values.anti_sniping_enabled}
                      onChange={(checked) => setField('anti_sniping_enabled', checked)}
                    />
                    {values.anti_sniping_enabled && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                          label="Ventana (segundos antes del cierre)"
                          type="number"
                          min={10}
                          max={3600}
                          value={values.timed_extension_window_seconds}
                          onChange={(event) => setField('timed_extension_window_seconds', event.target.value)}
                          error={stepErr.timed_extension_window_seconds}
                        />
                        <Input
                          label="Extensión (segundos)"
                          type="number"
                          min={10}
                          max={3600}
                          value={values.timed_extension_duration_seconds}
                          onChange={(event) => setField('timed_extension_duration_seconds', event.target.value)}
                          error={stepErr.timed_extension_duration_seconds}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step.id === 'garantia' && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-line p-4">
                  <Switch
                    id={guaranteeSwitchId}
                    label="Pedir garantía para ofertar"
                    description="El comprador deja una tarjeta como respaldo: se bloquea el monto con Mercado Pago, no se cobra. Se libera si no gana ningún lote; si gana, se descuenta del precio final."
                    checked={values.guarantee_required}
                    onChange={(checked) => setField('guarantee_required', checked)}
                  />
                </div>
                {values.guarantee_required ? (
                  <Input
                    label={`Monto de la garantía (${values.currency.trim().toUpperCase() || 'moneda'})`}
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={values.guarantee_amount}
                    onChange={(event) => setField('guarantee_amount', event.target.value)}
                    error={stepErr.guarantee_amount}
                    placeholder="500000"
                  />
                ) : (
                  <Callout tone="warn">
                    Sin garantía, cualquiera puede ofertar sin respaldo. Está bien para remates chicos o de confianza.
                  </Callout>
                )}
              </div>
            )}

            {step.id === 'revisar' && (
              <div className="flex flex-col gap-4">
                {Object.keys(errors).length > 0 && (
                  <Callout tone="bad">Hay datos por completar antes de crear el remate. Tocá “Completar” en cada punto.</Callout>
                )}
                <ul className="flex flex-col gap-2">
                  <ReviewRow
                    label="Modalidad"
                    value={`${isTimed ? 'Timed Auction' : 'Remate en vivo'} · ${values.access_type === 'private' ? 'Privado' : 'Público'}`}
                  />
                  <ReviewRow
                    label="Datos"
                    value={[values.title.trim(), values.category ? CATEGORY_LABELS[values.category] : null].filter(Boolean).join(' · ') || 'Faltan el título y la categoría'}
                    ok={!stepHasErrors(1)}
                    onFix={() => goTo(1)}
                  />
                  <ReviewRow
                    label="Fechas"
                    value={
                      values.starts_at
                        ? `${formatLocalDateTime(values.starts_at)}${isTimed && values.ends_at ? ` → ${formatLocalDateTime(values.ends_at)}` : ''} · ${values.currency.toUpperCase()}`
                        : 'Sin fecha todavía (hace falta para publicar)'
                    }
                    ok={!stepHasErrors(2)}
                    onFix={() => goTo(2)}
                  />
                  <ReviewRow
                    label="Garantía"
                    value={values.guarantee_required ? `Pide ${formatMoney(values.guarantee_amount, values.currency)}` : 'No pide garantía'}
                    ok={!stepHasErrors(3)}
                    onFix={() => goTo(3)}
                  />
                </ul>
                <div className="rounded-2xl bg-surface-subtle p-4">
                  <h3 className="text-sm font-semibold text-ink">Qué sigue después de crearlo</h3>
                  <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-muted">
                    <li>Cargá los lotes: te llevamos directo a esa pantalla.</li>
                    {isTimed ? (
                      <li>No necesitás rematador: el remate arranca y cierra solo en las fechas que elegiste.</li>
                    ) : (
                      <li>Sumá el video de la transmisión (opcional) y generá el código para tu rematador operador.</li>
                    )}
                    <li>Publicalo para que los compradores puedan verlo.</li>
                  </ol>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </Modal>
  );
}

function ChoiceCard({
  name,
  value,
  selected,
  onSelect,
  icon,
  label,
  description,
  points,
}: {
  name: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  label: string;
  description: string;
  points?: string[];
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-all duration-200 focus-within:ring-2 focus-within:ring-brand-500 ${
        selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line-strong bg-white hover:border-ink'
      }`}
    >
      <input type="radio" name={name} value={value} checked={selected} onChange={onSelect} className="sr-only" />
      <span className={`flex items-center gap-2 ${selected ? 'text-brand-700' : 'text-ink'}`}>
        {icon}
        <span className="text-base font-semibold">{label}</span>
      </span>
      <span className="text-sm text-ink-muted">{description}</span>
      {points && (
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </label>
  );
}

function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'bad' }) {
  const toneClasses = {
    info: 'bg-brand-50 text-brand-800',
    warn: 'bg-warning-50 text-warning-900',
    bad: 'bg-danger-50 text-danger-700',
  }[tone];
  const Icon = tone === 'info' ? Info : TriangleAlert;
  return (
    <div className={`flex gap-2.5 rounded-2xl px-4 py-3 text-sm ${toneClasses}`}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function ReviewRow({ label, value, ok = true, onFix }: { label: string; value: string; ok?: boolean; onFix?: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}`}
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="truncate text-sm text-ink-muted">{value}</p>
      </div>
      {!ok && onFix && (
        <Button variant="secondary" onClick={onFix} className="px-3 py-1.5 text-xs">
          Completar
        </Button>
      )}
    </li>
  );
}
