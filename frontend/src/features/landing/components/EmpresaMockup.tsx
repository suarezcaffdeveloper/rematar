import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  Boxes,
  Calendar,
  Copy,
  FilePlus,
  KeyRound,
  Lock,
  MapPin,
  MessageSquare,
  PackagePlus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  TrendingUp,
  User,
  UserX,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { RotatingMockup, type MockupScene } from './RotatingMockup';
import { CoverBox, Eyebrow, StatTile } from './mockupPrimitives';

const BID_TIMELINE = [30, 55, 40, 70, 90, 60, 45, 80];

function InlineCopyChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400">{label}</span>
      <code className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
        {value}
      </code>
      <Copy className="h-3 w-3 text-slate-400" />
    </div>
  );
}

/** Campo de formulario recreado (borde + label chico + valor), mismo estilo que los
 * campos editables de "Nueva ronda" en `RematadorMockup` -- reusado acá para los
 * formularios de creación de remate/lote. */
function FieldBox({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm">
      <p className="flex items-center gap-1 truncate text-[9px] font-medium uppercase tracking-wide text-slate-400">
        {Icon && <Icon className="h-2.5 w-2.5 shrink-0" />}
        {label}
      </p>
      <p className="truncate text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}

const DESCRIPCION_TARGET = 'Hacienda de cría con genética Angus certificada, entrega con guía sanitaria al día.';

/**
 * Escena "Creación de remate" (pedido explícito: separada de la creación de lote, con
 * título/descripción/ubicación/fecha/categoría/moneda + botón, algunos campos ya
 * cargados y la animación de carga en alguno) -- el campo Descripción es el que se
 * "escribe" solo en loop; el resto llega precargado para no sobrecargar la escena con
 * texto tipeándose a la vez. Respeta `prefers-reduced-motion`: sin el loop, el campo
 * queda con el texto completo ya cargado (mismo criterio que el resto de los mockups).
 */
function CreacionRemateScene() {
  const prefersReducedMotion = useReducedMotion();
  const [descripcion, setDescripcion] = useState(prefersReducedMotion ? DESCRIPCION_TARGET : '');

  useEffect(() => {
    if (prefersReducedMotion) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
      timers.push(id);
    };

    const loop = () => {
      let i = 0;
      const typeChar = () => {
        i += 1;
        setDescripcion(DESCRIPCION_TARGET.slice(0, i));
        if (i < DESCRIPCION_TARGET.length) {
          wait(typeChar, 35);
        } else {
          wait(() => {
            setDescripcion('');
            wait(loop, 500);
          }, 2400);
        }
      };
      wait(typeChar, 35);
    };

    wait(loop, 1000);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [prefersReducedMotion]);

  const typing = descripcion.length > 0 && descripcion.length < DESCRIPCION_TARGET.length;

  return (
    <>
      <Eyebrow icon={FilePlus}>Crear remate</Eyebrow>
      <div className="mt-2 flex flex-col gap-1.5">
        <FieldBox label="Título" value="Remate Estancia La Elena" />
        <div className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm">
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Descripción</p>
          <p className="mt-0.5 min-h-[2.4em] text-xs leading-snug text-slate-700">
            {descripcion}
            {typing && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-brand-500 align-middle" />}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <FieldBox icon={MapPin} label="Ubicación" value="Chacabuco, Bs. As." />
          <FieldBox icon={Calendar} label="Fecha" value="24 ago · 15:00" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <FieldBox label="Categoría" value="Hacienda y ganadería" />
          <FieldBox label="Moneda" value="ARS · Peso argentino" />
        </div>
      </div>
      <div className="mt-auto rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm">
        Crear remate
      </div>
    </>
  );
}

const SCENES: MockupScene[] = [
  {
    key: 'analitica',
    label: 'Analítica en tiempo real',
    urlLabel: 'app.rematar.com/remates/estancia-la-elena/analitica',
    content: (
      <>
        <Eyebrow icon={BarChart3}>Analítica en tiempo real</Eyebrow>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <StatTile label="Compradores conectados" value="18" />
          <StatTile label="Ofertas por minuto" value="6" />
          <StatTile label="Lotes vendidos" value="9/14" />
          <StatTile label="Valor total adjudicado" value="$182.400" />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-slate-100">
          <span className="text-slate-400">Oferta más alta</span>
          <span className="font-semibold text-slate-900">$19.400 — Lote 14</span>
        </div>
        <div className="mt-auto">
          <Eyebrow>Evolución de ofertas</Eyebrow>
          <div className="mt-1.5 flex h-10 items-end gap-1">
            {BID_TIMELINE.map((height, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm bg-brand-300 last:bg-brand-600"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'creacion-remate',
    label: 'Creación de remate',
    urlLabel: 'app.rematar.com/mis-remates/nuevo',
    content: <CreacionRemateScene />,
  },
  {
    key: 'creacion-lote',
    label: 'Creación de lote',
    urlLabel: 'app.rematar.com/mis-remates/estancia-la-elena/lotes/nuevo',
    content: (
      <>
        <Eyebrow icon={PackagePlus}>Crear lote</Eyebrow>
        <div className="mt-2 flex gap-3">
          <CoverBox className="h-16 w-16 shrink-0" icon={<Boxes className="h-6 w-6 text-brand-300" />} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <FieldBox label="Título" value="Toro Angus Colorado" />
            <FieldBox label="Descripción" value="Toro reproductor de pedigrí, genética probada." />
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <FieldBox label="Precio base" value="$15.000" />
          <FieldBox label="Incremento mínimo" value="$500" />
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-sm">
          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="flex-1">Re-rematar si el lote queda desierto</span>
          <span className="relative h-4 w-7 shrink-0 rounded-full bg-brand-600">
            <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
          </span>
        </div>
        <div className="mt-auto rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm">
          Cargar lote
        </div>
      </>
    ),
  },
  {
    key: 'asignar-rematador',
    label: 'Asignación de martilleros',
    urlLabel: 'app.rematar.com/mis-remates/estancia-la-elena',
    content: (
      <>
        <div className="flex items-center justify-between gap-2">
          <Eyebrow icon={KeyRound}>Datos para el martillero</Eyebrow>
          <Badge variant="success">Operador asignado</Badge>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <InlineCopyChip label="ID del remate" value="REM-2451" />
          <InlineCopyChip label="Código de operador" value="8f3a-91c2" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          El código le da acceso al martillero a la consola operativa de este remate.
        </p>
        <div className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <RefreshCcw className="h-3.5 w-3.5" /> Regenerar código
        </div>
      </>
    ),
  },
  {
    key: 'moderacion',
    label: 'Moderación del remate',
    urlLabel: 'app.rematar.com/remates/estancia-la-elena/consola',
    content: (
      <>
        <Eyebrow>Compradores conectados · 3</Eyebrow>
        <ul className="mt-2 space-y-1.5">
          {['Comprador #214', 'Comprador #087', 'Comprador #133'].map((name) => (
            <li
              key={name}
              className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-100"
            >
              <span className="text-xs font-medium text-slate-700">{name}</span>
              <div className="flex items-center gap-1 text-slate-400">
                <VolumeX className="h-3.5 w-3.5" />
                <UserX className="h-3.5 w-3.5" />
              </div>
            </li>
          ))}
        </ul>

        <Eyebrow icon={MessageSquare} className="mt-3">
          Chat de la sala
        </Eyebrow>
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-100">
          <p className="min-w-0 truncate text-xs text-slate-600">
            <span className="font-semibold text-slate-500">Comprador #133: </span>
            ¡Descuentos en mi-pagina.com!
          </p>
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-danger-500" />
        </div>

        <div className="mt-auto flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
          <Lock className="h-3.5 w-3.5 shrink-0" /> Bloquear chat
        </div>
      </>
    ),
  },
  {
    key: 'historial-resultados',
    label: 'Historial y resultados',
    urlLabel: 'app.rematar.com/remates/estancia-la-elena/historial',
    content: (
      <>
        <Eyebrow>Resumen ejecutivo</Eyebrow>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <StatTile label="Valor adjudicado" value="$182.400" />
          <StatTile label="Lotes vendidos" value="9/14" />
          <StatTile label="Participantes" value="37" />
          <StatTile label="Total de ofertas" value="214" />
          <StatTile label="Duración" value="1h 42m" />
          <StatTile label="Oferta más alta" value="$19.400" />
        </div>
        <div className="mt-auto flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-success-600 shadow-sm ring-1 ring-inset ring-success-100">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-success-700">Diferencia obtenida</p>
            <p className="text-sm font-bold text-success-700">
              +22% <span className="font-medium text-success-600">· +$32.400 sobre la base</span>
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'venta-adjudicada',
    label: 'Venta adjudicada',
    urlLabel: 'app.rematar.com/ventas-adjudicadas/lote-14',
    content: (
      <>
        <Eyebrow>Venta adjudicada</Eyebrow>
        <div className="mt-2.5 flex items-start gap-3">
          <CoverBox className="h-14 w-16 shrink-0" icon={<Boxes className="h-5 w-5 text-brand-300" />} />
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-slate-900">Toro Angus Colorado</h4>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-brand-600">$19.400</p>
          </div>
          <Badge variant="warning" className="shrink-0">
            Preparando entrega
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <User className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Martín Alsina</p>
            <p className="truncate text-[11px] text-slate-500">martin.alsina@mail.com · +54 9 11 5555-2231</p>
          </div>
        </div>
        <div className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <MessageSquare className="h-3.5 w-3.5" /> Contactar al comprador
        </div>
      </>
    ),
  },
];

/**
 * Visual de la sección "Beneficios para empresas" (`BenefitsSection` en `LandingPage`)
 * -- recreación con `RotatingMockup` del backoffice real de la empresa dueña del remate:
 * analítica en tiempo real, creación de remate y de lote (por separado, cada una con sus
 * propios campos), asignación de martilleros, moderación del remate en vivo (mismo
 * criterio que la consola del rematador en `RematadorMockup`), historial/resultados y el
 * detalle de una venta adjudicada.
 */
export function EmpresaMockup() {
  return <RotatingMockup scenes={SCENES} />;
}
