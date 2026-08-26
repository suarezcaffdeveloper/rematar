import type { ReactNode } from 'react';
import {
  BadgeCheck,
  Boxes,
  ChevronsRight,
  Gavel,
  MessageSquare,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  UserX,
  VolumeX,
  XOctagon,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { RotatingMockup, type MockupScene } from './RotatingMockup';
import { CoverBox, Eyebrow, StatTile } from './mockupPrimitives';

const ACTION_TONE_CLASSES: Record<'brand' | 'success' | 'warning' | 'danger' | 'ink', string> = {
  brand: 'border-brand-200 text-brand-700',
  success: 'border-success-200 text-success-700',
  warning: 'border-warning-200 text-warning-700',
  danger: 'border-danger-200 text-danger-700',
  ink: 'border-slate-200 text-slate-600',
};

function ActionChip({
  icon: Icon,
  tone,
  full = false,
  className,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof ACTION_TONE_CLASSES;
  full?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center gap-1.5 rounded-md border bg-white px-2 py-1.5 text-[11px] font-semibold shadow-sm',
        full ? 'w-full' : 'flex-1',
        ACTION_TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

const CONECTADOS = ['Comprador #214', 'Comprador #087', 'Comprador #133'];

const PROXIMOS_LOTES = [
  { number: 15, title: 'Lote de vaquillonas', selected: true },
  { number: 16, title: 'Toro Hereford PC', selected: false },
  { number: 17, title: 'Lote mixto Angus', selected: false },
];

const SCENES: MockupScene[] = [
  {
    key: 'panel-control',
    label: 'Panel de control operativo',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Panel de control operativo</Eyebrow>
        <div className="mt-2 flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gestión de lote</p>
            <div className="mt-1 flex flex-col gap-1.5">
              <ActionChip icon={ChevronsRight} tone="brand" full>
                Pasar al siguiente lote
              </ActionChip>
              <div className="flex gap-1.5">
                <ActionChip icon={PlayCircle} tone="success">
                  Abrir lote
                </ActionChip>
                <ActionChip icon={PackageCheck} tone="ink">
                  Cerrar lote
                </ActionChip>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Adjudicación de lote</p>
            <ActionChip icon={Gavel} tone="success" full className="mt-1">
              Adjudicar lote
            </ActionChip>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controles de remate</p>
            <div className="mt-1 flex gap-1.5">
              <ActionChip icon={PauseCircle} tone="warning">
                Pausar remate
              </ActionChip>
              <ActionChip icon={PlayCircle} tone="ink">
                Reanudar remate
              </ActionChip>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-danger-600">Zona crítica</p>
          <ActionChip icon={XOctagon} tone="danger" full className="mt-1">
            Finalizar remate
          </ActionChip>
        </div>
      </>
    ),
  },
  {
    key: 'lote-activo',
    label: 'Lote activo',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-brand-600">
              Lote 14 · Hacienda y ganadería
            </p>
            <h4 className="text-sm font-bold text-slate-900">Toro Angus Colorado PC</h4>
          </div>
          <Badge variant="warning" className="shrink-0">
            Abierto
          </Badge>
        </div>
        <div className="mt-2.5 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <CoverBox key={i} className="aspect-square w-14" icon={<Boxes className="h-5 w-5 text-brand-300" />} />
          ))}
        </div>
        <p className="mt-2.5 font-mono text-xs tabular-nums text-slate-500">
          Precio inicial $15.000 · incremento mínimo $500
        </p>
        <Eyebrow className="mt-2">Ficha técnica</Eyebrow>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          <StatTile label="Cantidad" value="1 unidad" />
          <StatTile label="Peso" value="580 kg" />
          <StatTile label="Edad" value="3 años" />
        </div>
      </>
    ),
  },
  {
    key: 'oferta-chat',
    label: 'Oferta líder y chat',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Oferta líder</Eyebrow>
        <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-2">
          <BadgeCheck className="h-4 w-4 shrink-0 text-success-600" />
          <div className="text-xs leading-tight">
            <p className="font-semibold text-success-700">Comprador #214</p>
            <p className="text-success-600">Lidera con $19.400</p>
          </div>
        </div>
        <ul className="mt-1">
          <li className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm">
            <span className="font-mono tabular-nums text-slate-700">$19.000</span>
            <Badge variant="neutral">Superada</Badge>
          </li>
          <li className="flex items-center justify-between py-1.5 text-sm">
            <span className="font-mono tabular-nums text-slate-700">$18.500</span>
            <Badge variant="success">Aceptada</Badge>
          </li>
        </ul>
        <Eyebrow icon={MessageSquare} className="mt-2">
          Chat
        </Eyebrow>
        <div className="mt-1.5 flex-1 space-y-1.5 text-xs">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-500">Comprador #087: </span>
            ¿Incluye flete el lote 14?
          </p>
          <p className="text-sky-700">Sí, dentro del radio pactado.</p>
        </div>
        <div className="mt-auto flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200">
          <span className="flex-1 truncate text-[11px] text-slate-400">Escribí un mensaje...</span>
        </div>
      </>
    ),
  },
  {
    key: 'moderacion',
    label: 'Moderación',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Compradores conectados · {CONECTADOS.length}</Eyebrow>
        <ul className="mt-2.5 flex-1 space-y-1.5">
          {CONECTADOS.map((name) => (
            <li key={name} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-100">
              <span className="text-xs font-medium text-slate-700">{name}</span>
              <div className="flex items-center gap-1 text-slate-400">
                <VolumeX className="h-3.5 w-3.5" />
                <UserX className="h-3.5 w-3.5" />
              </div>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    key: 'proximos-lotes',
    label: 'Próximos lotes',
    urlLabel: 'app.rematar.com/remates/consola',
    content: (
      <>
        <Eyebrow>Próximos lotes</Eyebrow>
        <div className="mt-2.5 flex flex-1 gap-2">
          {PROXIMOS_LOTES.map((lote) => (
            <div
              key={lote.number}
              className={clsx(
                'flex w-1/3 flex-col gap-1.5 rounded-lg p-1',
                lote.selected && 'ring-2 ring-brand-500',
              )}
            >
              <CoverBox className="aspect-square w-full" icon={<Boxes className="h-6 w-6 text-brand-300" />} />
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Lote {lote.number}</p>
              <Badge variant="neutral" className="w-fit">
                Pendiente
              </Badge>
              <p className="truncate text-xs text-slate-600">{lote.title}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
];

/**
 * Visual de la sección "Beneficios para rematadores" (`BenefitsSection` en
 * `LandingPage`) -- recreación con `RotatingMockup` de la consola operativa real que usa
 * el rematador (panel de control, lote activo, oferta líder + chat, moderación y
 * próximos lotes), en vez del video único que mostraba antes `RematadorConsoleMockup`.
 */
export function RematadorMockup() {
  return <RotatingMockup scenes={SCENES} />;
}
