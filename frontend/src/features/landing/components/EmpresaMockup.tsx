import { BarChart3, Calendar, Copy, KeyRound, Layers, RefreshCcw, Settings } from 'lucide-react';
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
    key: 'gestion-remates',
    label: 'Gestión de remates y lotes',
    urlLabel: 'app.rematar.com/mis-remates',
    content: (
      <>
        <div className="flex gap-3">
          <CoverBox className="aspect-video w-24" icon={<Layers className="h-6 w-6 text-brand-300" />} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="success">En vivo</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                Hacienda y ganadería
              </span>
            </div>
            <h4 className="mt-1 truncate text-sm font-bold text-slate-900">Remate Estancia La Elena</h4>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="h-3.5 w-3.5" /> 24 ago 2026
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Settings className="h-3.5 w-3.5" /> Configuración del remate
        </div>
        <div className="mt-auto flex gap-1.5">
          <span className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-600 shadow-sm">
            Agregar lote
          </span>
          <span className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm">
            Publicar remate
          </span>
        </div>
      </>
    ),
  },
  {
    key: 'asignar-rematador',
    label: 'Asignación de rematadores',
    urlLabel: 'app.rematar.com/mis-remates/estancia-la-elena',
    content: (
      <>
        <div className="flex items-center justify-between gap-2">
          <Eyebrow icon={KeyRound}>Datos para el rematador</Eyebrow>
          <Badge variant="success">Operador asignado</Badge>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <InlineCopyChip label="ID del remate" value="REM-2451" />
          <InlineCopyChip label="Código de operador" value="8f3a-91c2" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          El código le da acceso al rematador a la consola operativa de este remate.
        </p>
        <div className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <RefreshCcw className="h-3.5 w-3.5" /> Regenerar código
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
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <StatTile label="Valor total adjudicado" value="$182.400" />
          <StatTile label="Lotes vendidos" value="9/14" />
          <StatTile label="Participantes" value="37" />
          <StatTile label="Total de ofertas" value="214" />
        </div>
        <div className="mt-auto flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">Remate Estancia La Elena</p>
            <p className="text-[10px] text-slate-400">24 ago 2026</p>
          </div>
          <Badge variant="neutral">Finalizado</Badge>
        </div>
      </>
    ),
  },
];

/**
 * Visual de la sección "Beneficios para empresas" (`BenefitsSection` en `LandingPage`)
 * -- recreación con `RotatingMockup` del backoffice real de la empresa dueña del remate
 * (analítica en tiempo real, gestión de remates y lotes, asignación de rematadores e
 * historial), distinto del panel operativo del rematador que muestra `RematadorMockup`
 * (antes ambas secciones reusaban el mismo video, `RematadorConsoleMockup`).
 */
export function EmpresaMockup() {
  return <RotatingMockup scenes={SCENES} />;
}
