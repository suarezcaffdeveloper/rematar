import { type ReactNode, useState } from 'react';
import {
  AlertTriangle,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  SkipForward,
  XOctagon,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button, type ButtonProps } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { Input } from '../../../shared/components/Input';
import { formatCurrency } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  closeLoteRequest,
  finishRemateRequest,
  openLoteRequest,
  openNextLoteRequest,
  pauseRemateRequest,
  resumeRemateRequest,
} from '../../remates/api';
import type { Lote, Remate } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../../sala/types';
import { DesiertoLoteNotice } from './DesiertoLoteNotice';

export interface ConsolaControlPanelProps {
  remate: Remate;
  activeLote: Lote | null;
  /** Oferta líder del lote activo (mismo dato que ya recibe `ConsolaLotePanel`) --
   * `null` si nadie ofertó todavía. La usa "Pasar al siguiente lote" para adjudicar el
   * lote activo automáticamente antes de abrir el próximo, ver docstring más abajo. */
  winningOffer: OfertaSnapshotEntry | null;
  /** Ofertas recientes del lote activo, más nueva primero (mismo dato/orden que ya
   * consume `ConsolaOfferPanel`) -- se usa solo para la advertencia de "Cerrar lote" de
   * más abajo, ver `secondsSinceLastOffer`. */
  recentOffers: OfertaSnapshotEntry[];
  selectedLoteId: string | null;
  hasUpcomingLotes: boolean;
}

/** Si la oferta más reciente entró hace menos de esto, "Cerrar lote" pide confirmación
 * extra en vez de abrir el formulario de cierre directo (pedido explícito: evitar cerrar
 * un lote justo cuando acaba de entrar una oferta que el rematador todavía no vio). */
const RECENT_OFFER_WARNING_SECONDS = 15;

/** `recentOffers[0]` es siempre la más nueva (mismo criterio que `ConsolaOfferPanel`'s
 * `latestOfferId`) -- `null` si todavía no hay ninguna oferta en el lote. */
function secondsSinceLastOffer(recentOffers: OfertaSnapshotEntry[]): number | null {
  const lastOffer = recentOffers[0];
  if (!lastOffer) return null;
  return Math.floor((Date.now() - new Date(lastOffer.created_at).getTime()) / 1000);
}

type PendingAction = 'pause' | 'resume' | 'finish' | 'openSelected' | 'openNext' | 'close' | null;

type ConfirmableAction = 'pause' | 'finish';

/** Botón de acción del panel -- mismo `Button` compartido (conserva `isLoading`/
 * `disabled`/estados de variante que el resto de la app). `SIZE_CLASSES` solo ajusta
 * densidad/tamaño (`!` para no depender del orden en que Tailwind emite las reglas de
 * padding/tamaño de texto, que `Button` también fija) -- dos tamaños para reflejar la
 * jerarquía por uso del panel: `lg` para la única acción hero ("Pasar al siguiente
 * lote"), `md` para el resto (abrir/cerrar lote, pausar/reanudar remate, finalizar
 * remate en la zona crítica), todos a todo el ancho de su card (pedido explícito del
 * rediseño sobre la referencia visual: botones grandes, uno por fila).
 *
 * Microinteracción compartida por ambos tamaños (`hover:-translate-y-0.5
 * hover:shadow-md`, con `active:` volviendo a su lugar): mismo lenguaje "SaaS premium"
 * (Linear/Stripe/Vercel) pedido para toda la pantalla -- un botón que se levanta
 * levemente al pasar el mouse y vuelve al hacer click, sin animaciones exageradas. */
const SIZE_CLASSES: Record<'md' | 'lg', string> = {
  md: '!gap-2.5 !rounded-xl !px-5 !py-3.5 !text-base !font-semibold',
  lg: '!gap-3 !rounded-xl !px-6 !py-5 !text-lg !font-bold',
};

const HOVER_LIFT_CLASSES =
  'transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:hover:translate-y-0 disabled:hover:shadow-none';

function ActionButton({
  icon: Icon,
  children,
  className,
  size = 'md',
  variant = 'primary',
  ...props
}: ButtonProps & { icon: LucideIcon; size?: 'md' | 'lg' }) {
  return (
    <Button variant={variant} className={clsx(SIZE_CLASSES[size], HOVER_LIFT_CLASSES, className)} {...props}>
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      {children}
    </Button>
  );
}

/** Card de agrupación -- etiqueta chica en mayúsculas, mismo patrón que
 * `text-xs font-bold uppercase tracking-wide text-slate-500` de `ConsolaOfferPanel`. */
function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Panel de control de la Consola Operativa (Épica 5, Módulo 5.2; rediseñado en la
 * Épica 9, Etapa 6; con la jerarquía "opción 1A" del proyecto de diseño "Panel de
 * Remate"; y de nuevo en el rediseño "Modo Remate" sobre la captura de Stitch, que
 * elimina por completo el concepto de timer -- ya no hay pausar/reanudar/reiniciar
 * timer, cierre automático ni fijar tiempo restante, ni acá ni en `ConsolaLotePanel`).
 * Las cinco acciones que quedan (abrir lote, pausar remate, reanudar remate, cerrar
 * lote, pasar al siguiente lote, finalizar) siguen consumiendo exactamente los mismos
 * endpoints del motor de estados (`docs/16-motor-de-estados.md`) y las mismas
 * precondiciones cliente-side que ya validaba este panel -- el rediseño es puramente de
 * presentación: "Pasar al siguiente lote" (la acción que más se usa durante un remate en
 * vivo) queda arriba de todo, sola, como botón hero a todo el ancho sobre una card
 * "azul fuerte" ("Panel de control operativo"); el resto de los controles se agrupan en
 * dos cards propias ("Gestión de lote": abrir/cerrar; "Controles de remate": pausar/
 * reanudar), cada botón a todo el ancho y con un color "soft" que comunica la naturaleza
 * de la acción (verde para abrir, azul claro para cerrar/reanudar, naranja para pausar --
 * paleta alineada con el mockup de referencia "Modo Remate"/Stitch); "Finalizar remate"
 * sigue en su propia "Zona crítica" con acento rojo. Los botones siguen siempre visibles,
 * habilitándose/deshabilitando según el estado actual, sin ningún cambio de lógica.
 *
 * "Cerrar lote" y "Pasar al siguiente lote" comparten la decisión de qué hacer con el
 * lote activo, en base a `winningOffer` (Módulo de lotes desiertos, pedido explícito:
 * "ambos botones deberían hacer lo mismo si el lote está desierto"): sin ninguna oferta,
 * los dos cierran el lote directo como `outcome: 'unsold'` (`closeActiveLoteAsUnsold`) y
 * disparan el aviso flotante `DesiertoLoteNotice` (ver más abajo) -- no tiene sentido
 * preguntar Vendido/Desierto ni pedir un precio cuando no hay ninguna oferta que pudiera
 * haberlo vendido. Con oferta ganadora, "Pasar al siguiente lote" adjudica solo
 * (`outcome: 'sold'`, `final_price` igual al monto de `winningOffer`) y "Cerrar lote"
 * sigue abriendo el formulario manual de siempre (para ajustar el precio final, o
 * declarar el lote desierto igual pese a la oferta) -- en ambos casos "Pasar al
 * siguiente lote" recién después abre el siguiente lote, con un solo click. Reusa el
 * mismo endpoint de cierre manual (`closeLoteRequest`) sin ningún cambio de backend:
 * `PostAuctionEventDispatcher` (`app/postauction/realtime.py`) ya resuelve el comprador
 * real a partir de la oferta `ACCEPTED` vigente del lote cuando un cierre manual declara
 * `sold` (corrección de ADR-018 documentada ahí mismo), así que el caso post-remate se
 * crea igual que si hubiera cerrado por vencimiento del timer. Si el cierre falla, no se
 * intenta abrir el siguiente lote. "Pausar remate" y "Finalizar remate" usan
 * `ConfirmModal` en vez de `window.confirm` -- consistente con el resto de
 * confirmaciones destructivas de la app, sin ejecutar la acción hasta que el usuario
 * confirma en el modal.
 *
 * "Cerrar lote" manual (con oferta ganadora), además, chequea `recentOffers` antes de
 * abrir el formulario (pedido explícito del rediseño "Modo Remate"): si la oferta más
 * nueva entró hace menos de `RECENT_OFFER_WARNING_SECONDS`, primero muestra un
 * `ConfirmModal` de advertencia ("Continuar cierre"/"Cancelar") -- el rematador puede
 * seguir igual, esto no bloquea nada, solo evita que cierre un lote sin haber visto la
 * última oferta. Sin ninguna oferta, esta advertencia no aplica (no hay nada reciente
 * que se pudiera haber pasado por alto).
 *
 * Aviso "Lote desierto" (`desiertoBanner` + `DesiertoLoteNotice`, Módulo de lotes
 * desiertos): pedido explícito -- NO una tarjeta embebida en este panel, sino una nube
 * flotante centrada en la pantalla, por encima de todo el contenido de la página (reusa
 * `Modal`, portal a `document.body`). Puramente informativo, un único botón
 * ("Continuar") que solo la cierra -- decidir si reincorporar el lote se hace aparte,
 * desde el panel persistente "Lotes desiertos" de `ConsolaOperativaPage`, no desde acá.
 * Se queda abierta hasta que el rematador la cierra a mano (Escape/click afuera/
 * "Continuar", los tres ya los resuelve `Modal`) -- ni siquiera se descarta sola si
 * mientras tanto se abre otro lote.
 *
 * Deliberadamente sin ningún `reload()`/refresco manual tras una acción exitosa: la
 * propia consola ya está unida a la sala por WebSocket (`useLiveRemateState`, Épica 4.6),
 * así que el evento que la acción dispara (`lote.opened`, `remate.paused`, etc.) vuelve
 * por el mismo canal y actualiza todo, normalmente antes incluso de que esta misma
 * llamada HTTP termine de resolver. Se probó agregar un refresco HTTP de respaldo
 * (`reload()` de `useRemateSnapshot`) "por las dudas" y **empeoró las cosas**: el
 * Snapshot Service cachea la respuesta cruda en Redis por `SNAPSHOT_CACHE_TTL_SECONDS`
 * (2s, ver `docs/23-snapshot-service.md`) -- un `reload()` disparado justo después de
 * abrir un lote podía traer de vuelta la respuesta cacheada de *antes* de la acción,
 * pisando el estado correcto que el evento de WebSocket ya había aplicado. Ver
 * ADR-033 para el detalle completo.
 */
export function ConsolaControlPanel({
  remate,
  activeLote,
  winningOffer,
  recentOffers,
  selectedLoteId,
  hasUpcomingLotes,
}: ConsolaControlPanelProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmableAction | null>(null);
  const [isClosingLote, setIsClosingLote] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<'sold' | 'unsold'>('sold');
  const [finalPrice, setFinalPrice] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeWarningSeconds, setCloseWarningSeconds] = useState<number | null>(null);
  // Módulo de lotes desiertos: lote que acaba de cerrarse sin adjudicación -- dispara
  // el aviso flotante `DesiertoLoteNotice` (ver docstring más abajo). `null` cuando no
  // hay ninguno para mostrar. Se queda abierto hasta que el rematador lo cierra a mano
  // ("Continuar"/Escape/click afuera) -- no se descarta solo, ni siquiera si mientras
  // tanto se abre otro lote.
  const [desiertoBanner, setDesiertoBanner] = useState<Lote | null>(null);

  const isLive = remate.status === 'live';
  const isPaused = remate.status === 'paused';

  async function runSimpleAction(
    action: Exclude<PendingAction, 'close' | null>,
    request: () => Promise<unknown>,
    successMessage: string,
  ) {
    setPendingAction(action);
    try {
      await request();
      useToastStore.getState().push('success', successMessage);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleConfirmedAction() {
    if (confirmAction === 'pause') {
      await runSimpleAction('pause', () => pauseRemateRequest(remate.id), 'El remate se pausó.');
    } else if (confirmAction === 'finish') {
      await runSimpleAction('finish', () => finishRemateRequest(remate.id), 'El remate se finalizó.');
    }
    setConfirmAction(null);
  }

  /** Cierra el lote activo como desierto (sin ofertas) y muestra el cartel de lote
   * desierto -- compartido por "Pasar al siguiente lote" y "Cerrar lote" cuando no hay
   * ninguna oferta: sin nada que elegir (no hay precio ni "vendido" posible), ambos
   * botones hacen exactamente lo mismo en ese caso (pedido explícito) en vez de abrir
   * el formulario manual de Vendido/Desierto. Devuelve `true` si el cierre tuvo éxito. */
  async function closeActiveLoteAsUnsold(lote: Lote): Promise<boolean> {
    setPendingAction('close');
    try {
      await closeLoteRequest(remate.id, lote.id, { outcome: 'unsold', final_price: undefined });
      useToastStore.getState().push('success', 'Lote cerrado como desierto (sin ofertas).');
      setDesiertoBanner(lote);
      return true;
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  /** "Pasar al siguiente lote": si hay un lote activo, primero lo adjudica solo (ver
   * docstring del componente) y recién si eso funciona abre el siguiente -- si no hay
   * lote activo, se comporta como siempre (solo abre el siguiente). */
  async function handleAdvance() {
    if (activeLote) {
      if (winningOffer) {
        setPendingAction('close');
        try {
          await closeLoteRequest(remate.id, activeLote.id, {
            outcome: 'sold',
            final_price: winningOffer.amount,
          });
          useToastStore
            .getState()
            .push('success', `Lote adjudicado por ${formatCurrency(winningOffer.amount, remate.settings.currency)}.`);
        } catch (err) {
          useToastStore.getState().push('error', normalizeApiError(err).message);
          return;
        } finally {
          setPendingAction(null);
        }
      } else if (!(await closeActiveLoteAsUnsold(activeLote))) {
        return;
      }
      if (!hasUpcomingLotes) return;
    }
    await runSimpleAction('openNext', () => openNextLoteRequest(remate.id), 'Lote abierto.');
  }

  function openCloseForm() {
    setCloseOutcome('sold');
    setFinalPrice('');
    setCloseError(null);
    setIsClosingLote(true);
  }

  /** "Cerrar lote": sin ninguna oferta no hay nada que decidir -- se cierra directo
   * como desierto (mismo camino que "Pasar al siguiente lote" en ese caso, ver
   * `closeActiveLoteAsUnsold`), sin pasar por el formulario manual de Vendido/Desierto.
   * Con una oferta ganadora, sigue disponible el formulario de siempre (para ajustar el
   * precio final o declarar el lote desierto igual pese a la oferta) -- y, si esa
   * oferta entró hace menos de `RECENT_OFFER_WARNING_SECONDS`, primero pide
   * confirmación extra (pedido explícito -- evitar cerrar justo cuando acaba de entrar
   * una oferta que el rematador todavía no vio) en vez de abrir el formulario directo. */
  async function handleCloseLoteClick() {
    if (!activeLote) return;
    if (!winningOffer) {
      await closeActiveLoteAsUnsold(activeLote);
      return;
    }
    const seconds = secondsSinceLastOffer(recentOffers);
    if (seconds !== null && seconds < RECENT_OFFER_WARNING_SECONDS) {
      setCloseWarningSeconds(seconds);
      return;
    }
    openCloseForm();
  }

  function cancelCloseForm() {
    setIsClosingLote(false);
    setCloseError(null);
  }

  const basePrice = activeLote ? Number(activeLote.base_price) : 0;
  const parsedFinalPrice = Number(finalPrice);
  const isFinalPriceValid =
    finalPrice.trim() !== '' && Number.isFinite(parsedFinalPrice) && parsedFinalPrice >= basePrice;

  async function submitClose() {
    // "Confirmar cierre" ya queda deshabilitado mientras `outcome === 'sold'` y el
    // precio no es válido (ver el botón más abajo) -- acá no hace falta repetir esa
    // validación, este handler nunca se dispara en ese estado.
    if (!activeLote) return;

    setPendingAction('close');
    setCloseError(null);
    try {
      await closeLoteRequest(remate.id, activeLote.id, {
        outcome: closeOutcome,
        final_price: closeOutcome === 'sold' ? finalPrice : undefined,
      });
      useToastStore.getState().push('success', 'El lote se cerró.');
      if (closeOutcome === 'unsold') setDesiertoBanner(activeLote);
      setIsClosingLote(false);
    } catch (err) {
      setCloseError(normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  if (isClosingLote && activeLote) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <PackageCheck aria-hidden="true" className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Cerrar lote {activeLote.lot_number}
          </h2>
        </div>

        <div className="flex gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="close-outcome"
              checked={closeOutcome === 'sold'}
              onChange={() => {
                setCloseOutcome('sold');
                setCloseError(null);
              }}
            />
            Vendido
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="close-outcome"
              checked={closeOutcome === 'unsold'}
              onChange={() => {
                setCloseOutcome('unsold');
                setCloseError(null);
              }}
            />
            Desierto
          </label>
        </div>

        {closeOutcome === 'sold' && (
          <Input
            label="Precio final"
            type="number"
            min={activeLote.base_price}
            step="0.01"
            value={finalPrice}
            onChange={(event) => setFinalPrice(event.target.value)}
            error={closeError ?? undefined}
          />
        )}
        {closeOutcome === 'unsold' && closeError && <p className="text-sm text-danger-600">{closeError}</p>}

        <div className="flex gap-2">
          <Button
            onClick={submitClose}
            isLoading={pendingAction === 'close'}
            disabled={closeOutcome === 'sold' && !isFinalPriceValid}
          >
            Confirmar cierre
          </Button>
          <Button variant="ghost" onClick={cancelCloseForm} disabled={pendingAction === 'close'}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Hero: la acción que más se usa durante un remate en vivo, sola, a todo el
       * ancho -- jerarquía por uso. Label + acción viven en la misma card (look
       * "AuctionPro"), sin el header separado que tenía antes ni el chip de estado
       * ("Remate activo"), que el rediseño "Modo Remate" saca por completo del panel --
       * ese estado ya se infiere de qué botones quedan habilitados. */}
      <div className="flex flex-col gap-2 rounded-xl bg-brand-700 p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-brand-100">
          Panel de control operativo
        </h2>
        <ActionButton
          icon={SkipForward}
          variant="inverse"
          className="w-full"
          onClick={() => handleAdvance()}
          isLoading={pendingAction === 'close' || pendingAction === 'openNext'}
          disabled={!isLive || (!activeLote && !hasUpcomingLotes) || pendingAction !== null}
        >
          Pasar al siguiente lote
        </ActionButton>
      </div>

      {/* Módulo de lotes desiertos: aviso flotante (no una tarjeta embebida acá) --
       * ver `DesiertoLoteNotice`. Se renderiza siempre (portal a `document.body`,
       * controlado por `isOpen`/`lote`), así que su posición en este JSX no importa. */}
      <DesiertoLoteNotice lote={desiertoBanner} onClose={() => setDesiertoBanner(null)} />

      <ControlSection title="Gestión de lote">
        <div className="flex flex-col gap-1.5">
          <ActionButton
            icon={PlayCircle}
            variant="success-soft"
            className="w-full"
            onClick={() =>
              selectedLoteId &&
              runSimpleAction('openSelected', () => openLoteRequest(remate.id, selectedLoteId), 'Lote abierto.')
            }
            isLoading={pendingAction === 'openSelected'}
            disabled={!isLive || Boolean(activeLote) || !selectedLoteId || pendingAction !== null}
            title={!selectedLoteId ? 'Seleccioná un lote en "Próximos lotes" primero.' : undefined}
          >
            Abrir lote
          </ActionButton>

          <ActionButton
            icon={PackageCheck}
            variant="brand-soft"
            className="w-full"
            onClick={handleCloseLoteClick}
            isLoading={pendingAction === 'close'}
            disabled={!(isLive || isPaused) || !activeLote || pendingAction !== null}
          >
            Cerrar lote
          </ActionButton>
        </div>
      </ControlSection>

      <ControlSection title="Controles de remate">
        <div className="flex flex-col gap-1.5">
          <ActionButton
            icon={PauseCircle}
            variant="warning-soft"
            className="w-full"
            onClick={() => setConfirmAction('pause')}
            isLoading={pendingAction === 'pause'}
            disabled={!isLive || pendingAction !== null}
          >
            Pausar remate
          </ActionButton>

          <ActionButton
            icon={PlayCircle}
            variant="brand-soft"
            className="w-full"
            onClick={() => runSimpleAction('resume', () => resumeRemateRequest(remate.id), 'El remate se reanudó.')}
            isLoading={pendingAction === 'resume'}
            disabled={!isPaused || pendingAction !== null}
          >
            Reanudar remate
          </ActionButton>
        </div>
      </ControlSection>

      <div className="flex flex-col gap-1.5 rounded-xl border border-danger-200 bg-danger-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-danger-700">Zona crítica</h3>
            
          </div>
        </div>
        <ActionButton
          icon={XOctagon}
          variant="danger"
          onClick={() => setConfirmAction('finish')}
          isLoading={pendingAction === 'finish'}
          disabled={!isLive || Boolean(activeLote) || pendingAction !== null}
          title={activeLote ? 'Cerrá el lote abierto antes de finalizar el remate.' : undefined}
          className="w-full"
        >
          Finalizar remate
        </ActionButton>
      </div>

      {/* Título + descripción + Cancelar/Confirmar (pedido explícito) -- `confirmLabel`/
       * `cancelLabel` quedan en su default ("Confirmar"/"Cancelar") a propósito: si acá
       * repitiera el nombre de la acción ("Pausar remate"), colisionaría con el botón
       * disparador del panel, que sigue visible detrás del modal. */}
      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmedAction}
        variant={confirmAction === 'finish' ? 'danger' : 'primary'}
        title={confirmAction === 'finish' ? 'Finalizar remate' : 'Pausar remate'}
        message={
          confirmAction === 'finish'
            ? `¿Finalizar "${remate.title}"? Esta acción no se puede deshacer.`
            : `¿Pausar "${remate.title}"? Los compradores no van a poder ofertar hasta que lo reanudes.`
        }
      />

      {/* Oferta reciente al cerrar el lote (pedido explícito): no bloquea el cierre,
       * solo confirma que el rematador vio que acaba de entrar una oferta antes de
       * seguir. `onConfirm` recién ahí abre el formulario de cierre de siempre. */}
      <ConfirmModal
        isOpen={closeWarningSeconds !== null}
        onClose={() => setCloseWarningSeconds(null)}
        onConfirm={() => {
          setCloseWarningSeconds(null);
          openCloseForm();
        }}
        title="Oferta reciente"
        message={`Se recibió una oferta recientemente. Última oferta hace ${closeWarningSeconds} segundos. ¿Desea cerrar igualmente el lote?`}
        confirmLabel="Continuar cierre"
        cancelLabel="Cancelar"
      />
    </div>
  );
}
