import { type ReactNode, useState } from 'react';
import {
  ChevronsRight,
  Gavel,
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
   * `null` si nadie ofertó todavía. Determina si "Cerrar lote" (sin oferta) o "Adjudicar
   * lote" (con oferta) está habilitado, ver docstring más abajo. */
  winningOffer: OfertaSnapshotEntry | null;
  /** Ofertas recientes del lote activo, más nueva primero (mismo dato/orden que ya
   * consume `ConsolaOfferPanel`) -- se usa solo para la advertencia de "Adjudicar lote"
   * de más abajo, ver `secondsSinceLastOffer`. */
  recentOffers: OfertaSnapshotEntry[];
  selectedLoteId: string | null;
  hasUpcomingLotes: boolean;
}

/** Si la oferta más reciente entró hace menos de esto, "Adjudicar lote" pide
 * confirmación extra antes de adjudicar (pedido explícito: evitar que una oferta que
 * entró al milisegundo anterior se quede sin la chance de ser superada por otro
 * comprador). */
const ADJUDICATE_WARNING_SECONDS = 10;

/** `recentOffers[0]` es siempre la más nueva (mismo criterio que `ConsolaOfferPanel`'s
 * `latestOfferId`) -- `null` si todavía no hay ninguna oferta en el lote. */
function secondsSinceLastOffer(recentOffers: OfertaSnapshotEntry[]): number | null {
  const lastOffer = recentOffers[0];
  if (!lastOffer) return null;
  return Math.floor((Date.now() - new Date(lastOffer.created_at).getTime()) / 1000);
}

type PendingAction =
  | 'pause'
  | 'resume'
  | 'finish'
  | 'openSelected'
  | 'openNext'
  | 'close'
  | 'adjudicate'
  | null;

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
 * Remate"; en el rediseño "Modo Remate" sobre la captura de Stitch, que elimina por
 * completo el concepto de timer; y con el módulo de "Adjudicación de lote" que separa
 * la venta de un lote en su propia acción explícita, ver más abajo). Las seis acciones
 * (abrir lote, cerrar lote, adjudicar lote, pausar remate, reanudar remate, pasar al
 * siguiente lote, finalizar) siguen consumiendo los endpoints del motor de estados
 * (`docs/16-motor-de-estados.md`) -- todo el panel vive dentro de una única card de
 * fondo suave ("Panel de control operativo", ver el `<div>` raíz del `return`), en tres
 * grupos: "Gestión de lote" (pasar al siguiente lote, arriba, a todo el ancho + abrir/
 * cerrar), "Adjudicación de lote" (el nuevo botón, solo él, a todo el ancho) y
 * "Controles de remate" (pausar/reanudar), en variantes "outline" (fondo blanco, el
 * color vive en el borde/texto -- ver `shared/components/Button.tsx`); "Finalizar
 * remate" sigue en su propia "Zona crítica", separada solo por un divisor + label rojo.
 *
 * Adjudicar un lote (marcarlo `sold`) es exclusivo del botón "Adjudicar lote" (pedido
 * explícito: ni "Cerrar lote" ni "Pasar al siguiente lote" venden un lote nunca, para
 * que no exista la chance de que una oferta que acaba de entrar pierda su oportunidad de
 * ser superada por un cierre/avance automático):
 * - "Cerrar lote" solo está habilitado cuando el lote activo no tiene ninguna oferta
 *   (`!winningOffer`) -- lo cierra directo como `outcome: 'unsold'`
 *   (`handleCloseLoteClick`) y dispara el aviso flotante `DesiertoLoteNotice` (ver más
 *   abajo). Con oferta ganadora queda deshabilitado: la única forma de resolver ese lote
 *   pasa a ser "Adjudicar lote".
 * - "Adjudicar lote" solo está habilitado cuando hay oferta ganadora
 *   (`winningOffer`) -- cierra el lote como `outcome: 'sold'`, `final_price` igual al
 *   monto de `winningOffer` (reusa `closeLoteRequest` sin ningún cambio de backend:
 *   `PostAuctionEventDispatcher`, `app/postauction/realtime.py`, ya resuelve el
 *   comprador real a partir de la oferta `ACCEPTED` vigente del lote). Antes de
 *   adjudicar, chequea `recentOffers`: si la oferta más nueva entró hace menos de
 *   `ADJUDICATE_WARNING_SECONDS`, primero muestra un `ConfirmModal` de advertencia
 *   ("Adjudicar igual"/"Cancelar") -- el rematador puede seguir igual, esto no bloquea
 *   nada, solo evita adjudicar al milisegundo de haber entrado una oferta sin darle
 *   chance al resto de los compradores de superarla.
 * - "Pasar al siguiente lote" ya no toca el lote activo: queda deshabilitado mientras
 *   haya uno (cerrado o adjudicado, no importa cuál de los dos, es tarea del
 *   rematador resolverlo primero con los botones de arriba) y solo abre el próximo lote.
 *
 * "Pausar remate" y "Finalizar remate" usan `ConfirmModal` en vez de `window.confirm` --
 * consistente con el resto de confirmaciones destructivas de la app, sin ejecutar la
 * acción hasta que el usuario confirma en el modal.
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
  // Advertencia de "Adjudicar lote" cuando la última oferta entró hace menos de
  // `ADJUDICATE_WARNING_SECONDS` -- `null` cuando no hay ninguna advertencia pendiente.
  const [adjudicateWarningSeconds, setAdjudicateWarningSeconds] = useState<number | null>(null);
  // Módulo de lotes desiertos: lote que acaba de cerrarse sin adjudicación -- dispara
  // el aviso flotante `DesiertoLoteNotice` (ver docstring más abajo). `null` cuando no
  // hay ninguno para mostrar. Se queda abierto hasta que el rematador lo cierra a mano
  // ("Continuar"/Escape/click afuera) -- no se descarta solo, ni siquiera si mientras
  // tanto se abre otro lote.
  const [desiertoBanner, setDesiertoBanner] = useState<Lote | null>(null);

  const isLive = remate.status === 'live';
  const isPaused = remate.status === 'paused';

  async function runSimpleAction(
    action: Exclude<PendingAction, 'close' | 'adjudicate' | null>,
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

  /** "Cerrar lote": exclusivo del caso sin ninguna oferta (ver docstring del
   * componente) -- se cierra directo como `outcome: 'unsold'` y dispara el aviso
   * flotante `DesiertoLoteNotice` (ver más abajo). Con oferta ganadora el botón queda
   * deshabilitado (ver el JSX más abajo): la única forma de resolver ese lote pasa a ser
   * "Adjudicar lote". */
  async function handleCloseLoteClick() {
    if (!activeLote || winningOffer) return;
    setPendingAction('close');
    try {
      await closeLoteRequest(remate.id, activeLote.id, { outcome: 'unsold', final_price: undefined });
      useToastStore.getState().push('success', 'Lote cerrado como desierto (sin ofertas).');
      setDesiertoBanner(activeLote);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  /** "Pasar al siguiente lote": ya no toca el lote activo -- queda deshabilitado
   * mientras haya uno (ver el JSX más abajo, es tarea del rematador cerrarlo/adjudicarlo
   * primero con los botones de arriba) y acá solo abre el próximo. */
  async function handleAdvance() {
    await runSimpleAction('openNext', () => openNextLoteRequest(remate.id), 'Lote abierto.');
  }

  /** Adjudica el lote activo a la oferta ganadora (`outcome: 'sold'`, `final_price`
   * igual al monto de `winningOffer`) -- llamado directo por "Adjudicar lote" cuando no
   * hace falta advertencia, o por el `ConfirmModal` de "oferta reciente" cuando el
   * rematador confirma igual. */
  async function runAdjudicate(lote: Lote, offer: OfertaSnapshotEntry) {
    setPendingAction('adjudicate');
    try {
      await closeLoteRequest(remate.id, lote.id, { outcome: 'sold', final_price: offer.amount });
      useToastStore
        .getState()
        .push('success', `Lote adjudicado por ${formatCurrency(offer.amount, remate.settings.currency)}.`);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  /** "Adjudicar lote": solo tiene sentido con oferta ganadora (ver el JSX más abajo,
   * deshabilitado sin ella). Si la oferta más nueva entró hace menos de
   * `ADJUDICATE_WARNING_SECONDS`, primero pide confirmación extra (pedido explícito --
   * evitar adjudicar al milisegundo de haber entrado una oferta, sin darle chance al
   * resto de los compradores de superarla) en vez de adjudicar directo. */
  async function handleAdjudicateClick() {
    if (!activeLote || !winningOffer) return;
    const seconds = secondsSinceLastOffer(recentOffers);
    if (seconds !== null && seconds < ADJUDICATE_WARNING_SECONDS) {
      setAdjudicateWarningSeconds(seconds);
      return;
    }
    await runAdjudicate(activeLote, winningOffer);
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
       * vive adentro de "Gestión de lote", arriba de "Abrir lote"/"Cerrar lote" -- las
       * tres acciones operan sobre el mismo lote activo, tiene sentido que vivan juntas.
       * Ya no toca el lote activo (ver `handleAdvance`): queda deshabilitada mientras
       * haya uno, sin importar si tiene ofertas o no -- resolverlo (cerrarlo o
       * adjudicarlo) es tarea de los otros botones. Mismo ancho que "Finalizar remate"
       * (a todo el ancho del panel, `w-full` fuera de la grilla de 2 columnas) y misma
       * estética que el resto de los botones (`ActionButton`, variante "outline") --
       * distinguida solo por su color de marca (`brand-outline`, la única variante
       * "outline" con acento azul) en vez de tamaño o fondo distinto. */}
      <ControlSection title="Gestión de lote">
        <ActionButton
          icon={ChevronsRight}
          variant="brand-outline"
          className="col-span-2 w-full"
          onClick={() => handleAdvance()}
          isLoading={pendingAction === 'openNext'}
          disabled={!isLive || Boolean(activeLote) || !hasUpcomingLotes || pendingAction !== null}
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

        {/* Solo cierra lotes sin ninguna oferta (declararlos desierto) -- con oferta
         * ganadora queda deshabilitado, ver docstring del componente: la única forma de
         * resolver ese lote pasa a ser "Adjudicar lote". */}
        <ActionButton
          icon={PackageCheck}
          variant="ink-outline"
          className="w-full"
          onClick={handleCloseLoteClick}
          isLoading={pendingAction === 'close'}
          disabled={!(isLive || isPaused) || !activeLote || Boolean(winningOffer) || pendingAction !== null}
          title={activeLote && winningOffer ? 'Este lote tiene ofertas: adjudicalo o esperá a que se retracten.' : undefined}
        >
          Cerrar lote
        </ActionButton>
      </ControlSection>

      {/* "Adjudicación de lote" (nuevo módulo): única forma de marcar un lote como
       * vendido -- ver docstring del componente. Solo tiene sentido con oferta ganadora,
       * así que queda deshabilitado sin ella. Grupo propio entre "Gestión de lote" y
       * "Controles de remate" (pedido explícito), un solo botón a todo el ancho. */}
      <ControlSection title="Adjudicación de lote">
        <ActionButton
          icon={Gavel}
          variant="success-outline"
          className="col-span-2 w-full"
          onClick={handleAdjudicateClick}
          isLoading={pendingAction === 'adjudicate'}
          disabled={!(isLive || isPaused) || !activeLote || !winningOffer || pendingAction !== null}
          title={activeLote && !winningOffer ? 'Este lote todavía no tiene ninguna oferta.' : undefined}
        >
          Adjudicar lote
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

      {/* Oferta reciente al adjudicar el lote (pedido explícito): no bloquea la
       * adjudicación, solo confirma que el rematador vio que acaba de entrar una oferta
       * antes de seguir -- evita adjudicar al milisegundo de haber entrado una oferta,
       * sin darle chance al resto de los compradores de superarla. `onConfirm` recién ahí
       * adjudica de verdad. */}
      <ConfirmModal
        isOpen={adjudicateWarningSeconds !== null}
        onClose={() => setAdjudicateWarningSeconds(null)}
        onConfirm={() => {
          setAdjudicateWarningSeconds(null);
          if (activeLote && winningOffer) void runAdjudicate(activeLote, winningOffer);
        }}
        title="Oferta reciente"
        message={`Se recibió una oferta recientemente. Última oferta hace ${adjudicateWarningSeconds} segundos. ¿Desea adjudicar igualmente el lote?`}
        confirmLabel="Adjudicar igual"
        cancelLabel="Cancelar"
      />
    </div>
  );
}
