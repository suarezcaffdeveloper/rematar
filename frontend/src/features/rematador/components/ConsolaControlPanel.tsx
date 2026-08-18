import { type ReactNode, useState } from 'react';
import {
  ChevronsRight,
  PackageCheck,
  PauseCircle,
  PlayCircle,
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
 * `disabled`/estados de variante que el resto de la app). `!` en las clases: no depende
 * del orden en que Tailwind emite las reglas de padding/tamaño de texto, que `Button`
 * también fija.
 *
 * Retexturizado sobre el prototipo aprobado (captura puntual de la Consola Operativa):
 * antes cada botón ocupaba una fila completa dentro de una card con fondo de color
 * sólido ("soft") -- ahora van de a dos por fila (`grid-cols-2`, ver más abajo) en
 * variantes "outline" (fondo blanco, el color vive en el borde/texto -- ver
 * `shared/components/Button.tsx`), look más compacto y "de consola" en vez de una pila
 * de botones grandes.
 *
 * Microinteracción (`hover:-translate-y-0.5 hover:shadow-md`, con `active:` volviendo a
 * su lugar): mismo lenguaje "SaaS premium" (Linear/Stripe/Vercel) pedido para toda la
 * pantalla -- un botón que se levanta levemente al pasar el mouse y vuelve al hacer
 * click, sin animaciones exageradas. */
const HOVER_LIFT_CLASSES =
  'transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:hover:translate-y-0 disabled:hover:shadow-none';

function ActionButton({
  icon: Icon,
  children,
  className,
  variant = 'primary',
  ...props
}: ButtonProps & { icon: LucideIcon }) {
  return (
    <Button
      variant={variant}
      className={clsx('!gap-2 !rounded-lg !px-4 !py-3 !text-sm !font-semibold', HOVER_LIFT_CLASSES, className)}
      {...props}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {children}
    </Button>
  );
}

/** Grupo de acciones -- etiqueta chica en mayúsculas + una grilla de 2 columnas con los
 * botones del grupo. Sin card propia: la card única ya la pone el panel entero (ver el
 * `<div>` raíz del `return` de `ConsolaControlPanel`), así que cada grupo alcanza con
 * espacio + un label para separarse del de al lado, sin anidar una caja adentro de otra. */
function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h3>
      <div className="grid grid-cols-2 gap-2">{children}</div>
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
 * presentación: todo el panel vive dentro de una única card de fondo suave ("Panel de
 * control operativo", ver el `<div>` raíz del `return`), para que se lea de un vistazo
 * que es un bloque de gestión aparte del resto de la pantalla. Adentro, los controles se
 * agrupan de a dos por fila ("Gestión de lote": pasar al siguiente lote (a todo el
 * ancho, arriba) + abrir/cerrar; "Controles de remate": pausar/reanudar), en variantes
 * "outline" (fondo blanco, el color vive en el borde/texto -- ver
 * `shared/components/Button.tsx`) que comunican la naturaleza de la acción (azul de
 * marca para "pasar al siguiente lote", verde para abrir, ícono/texto neutro para
 * cerrar/reanudar, naranja para pausar); "Finalizar remate" sigue en su propia "Zona
 * crítica", separada solo por un divisor + label en rojo (sin card roja propia). Los
 * botones siguen siempre visibles, habilitándose/deshabilitando según el estado actual,
 * sin ningún cambio de lógica.
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
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-subtle p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <PackageCheck aria-hidden="true" className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Cerrar lote {activeLote.lot_number}
          </h2>
        </div>

        <div className="flex gap-4 text-sm text-ink-muted">
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
    <div className="flex flex-col gap-6 rounded-xl border border-line bg-surface-subtle p-5 shadow-sm">
      {/* Título único para todo el panel (antes solo encabezaba el botón hero) -- pedido
       * explícito: que se lea de un vistazo que toda esta columna, de acá para abajo, es
       * "la botonera de gestión" del remate. La card oscura (`bg-ink`) que tenía antes
       * el botón "Pasar al siguiente lote" se saca por completo -- en su lugar, todo el
       * panel (título + las tres secciones de abajo) queda contenido en una única card
       * de fondo suave (`bg-surface-subtle`, mismo tono que usa el resto del sistema de
       * diseño para "contenedor neutro discreto"), que ya alcanza para diferenciarlo del
       * resto de la página sin necesitar un acento oscuro. */}
      <h2 className="text-center text-sm font-extrabold uppercase tracking-wide text-ink-muted">
        Panel de control operativo
      </h2>

      {/* Módulo de lotes desiertos: aviso flotante (no una tarjeta embebida acá) --
       * ver `DesiertoLoteNotice`. Se renderiza siempre (portal a `document.body`,
       * controlado por `isOpen`/`lote`), así que su posición en este JSX no importa. */}
      <DesiertoLoteNotice lote={desiertoBanner} onClose={() => setDesiertoBanner(null)} />

      {/* "Pasar al siguiente lote" (la acción que más se usa durante un remate en vivo)
       * se muda adentro de "Gestión de lote", arriba de "Abrir lote"/"Cerrar lote" --
       * las tres acciones operan sobre el mismo lote activo, tiene sentido que vivan
       * juntas. Mismo ancho que "Finalizar remate" (a todo el ancho del panel, `w-full`
       * fuera de la grilla de 2 columnas) y misma estética que el resto de los botones
       * (`ActionButton`, variante "outline") -- ya no es un botón especial en una card
       * propia, es la primera acción del grupo, distinguida solo por su color de marca
       * (`brand-outline`, la única variante "outline" con acento azul) en vez de tamaño
       * o fondo distinto. */}
      <ControlSection title="Gestión de lote">
        <ActionButton
          icon={ChevronsRight}
          variant="brand-outline"
          className="col-span-2 w-full"
          onClick={() => handleAdvance()}
          isLoading={pendingAction === 'close' || pendingAction === 'openNext'}
          disabled={!isLive || (!activeLote && !hasUpcomingLotes) || pendingAction !== null}
        >
          Pasar al siguiente lote
        </ActionButton>

        <ActionButton
          icon={PlayCircle}
          variant="success-outline"
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
          variant="ink-outline"
          className="w-full"
          onClick={handleCloseLoteClick}
          isLoading={pendingAction === 'close'}
          disabled={!(isLive || isPaused) || !activeLote || pendingAction !== null}
        >
          Cerrar lote
        </ActionButton>
      </ControlSection>

      <ControlSection title="Controles de remate">
        <ActionButton
          icon={PauseCircle}
          variant="warning-outline"
          className="w-full"
          onClick={() => setConfirmAction('pause')}
          isLoading={pendingAction === 'pause'}
          disabled={!isLive || pendingAction !== null}
        >
          Pausar remate
        </ActionButton>

        <ActionButton
          icon={PlayCircle}
          variant="ink-outline"
          className="w-full"
          onClick={() => runSimpleAction('resume', () => resumeRemateRequest(remate.id), 'El remate se reanudó.')}
          isLoading={pendingAction === 'resume'}
          disabled={!isPaused || pendingAction !== null}
        >
          Reanudar remate
        </ActionButton>
      </ControlSection>

      {/* "Zona crítica" pierde su card roja (`border-danger-200 bg-danger-50`) sobre el
       * prototipo aprobado: un separador `border-t border-line` + el label en rojo ya
       * comunican "cuidado" sin necesitar una caja de color propia -- mismo criterio "no
       * más cards" que el resto del panel. El texto de ayuda debajo del botón (antes solo
       * un `title` en el `<button>`, invisible sin hover) ahora es visible siempre que la
       * acción está bloqueada por un lote abierto, para que quede claro sin depender de
       * un tooltip. */}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-danger-600">Zona crítica</h3>
        <ActionButton
          icon={XOctagon}
          variant="danger-outline"
          onClick={() => setConfirmAction('finish')}
          isLoading={pendingAction === 'finish'}
          disabled={!isLive || Boolean(activeLote) || pendingAction !== null}
          title={activeLote ? 'Cerrá el lote abierto antes de finalizar el remate.' : undefined}
          className="w-full"
        >
          Finalizar remate
        </ActionButton>
        {activeLote && (
          <p className="text-xs text-ink-faint">Cerrá el lote abierto antes de finalizar el remate.</p>
        )}
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
