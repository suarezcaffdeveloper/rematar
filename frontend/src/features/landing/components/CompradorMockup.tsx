import { BadgeCheck, Boxes, CreditCard, Send, Timer } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { RotatingMockup, type MockupScene } from './RotatingMockup';
import { CoverBox, Eyebrow, StatTile } from './mockupPrimitives';

const QUICK_BIDS = ['$19.900', '$20.400', '$20.900'];

const RECENT_OFFERS: { amount: string; time: string; label: string; variant: 'success' | 'neutral' | 'danger' }[] = [
  { amount: '$19.400', time: 'hace 12s', label: 'Ganadora', variant: 'success' },
  { amount: '$19.000', time: 'hace 38s', label: 'Superada', variant: 'neutral' },
  { amount: '$18.500', time: 'hace 1m', label: 'Aceptada', variant: 'success' },
];

const LOTES_DEL_REMATE: { number: number; title: string; label: string; variant: 'warning' | 'neutral' | 'success' }[] = [
  { number: 14, title: 'Toro Angus Colorado', label: 'Abierto', variant: 'warning' },
  { number: 15, title: 'Lote de vaquillonas', label: 'Pendiente', variant: 'neutral' },
  { number: 13, title: 'Toro Hereford PC', label: 'Vendido', variant: 'success' },
];

const MIS_REMATES: { title: string; category: string; label: string; variant: 'success' | 'brand' | 'neutral'; date: string }[] = [
  { title: 'Remate Estancia La Elena', category: 'Hacienda y ganadería', label: 'En vivo', variant: 'success', date: 'Hoy' },
  { title: 'Subasta de maquinaria agrícola', category: 'Maquinaria pesada y agrícola', label: 'Programado', variant: 'brand', date: '2 sep' },
  { title: 'Remate de inmuebles rurales', category: 'Inmuebles', label: 'Finalizado', variant: 'neutral', date: '18 ago' },
];

const SCENES: MockupScene[] = [
  {
    key: 'chat',
    label: 'Chat del remate',
    urlLabel: 'app.rematar.com/remates/sala',
    content: (
      <>
        <Eyebrow>Chat del remate</Eyebrow>
        <div className="mt-2.5 flex-1 space-y-2 text-sm">
          <div>
            <span className="text-xs font-semibold text-sky-700">Martillero</span>
            <p className="leading-snug text-slate-600">El lote 14 incluye flete dentro del radio pactado.</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Comprador #087</span>
            <p className="leading-snug text-slate-600">¿Se puede coordinar el retiro para el finde?</p>
          </div>
          <p className="leading-snug text-brand-700">Dale, después del remate te paso los datos.</p>
          <p className="text-center text-[11px] text-slate-400">Comprador #214 se unió a la sala</p>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
          <span className="flex-1 truncate text-xs text-slate-400">Escribí un mensaje...</span>
          <Send className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        </div>
      </>
    ),
  },
  {
    key: 'ofertar',
    label: 'Panel para ofertar',
    urlLabel: 'app.rematar.com/remates/sala',
    content: (
      <>
        <Eyebrow>Oferta actual · Comprador verificado</Eyebrow>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">$19.400</p>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
          Base $15.000 · incremento mínimo $500
        </p>
        <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700">
          <Timer className="h-3.5 w-3.5" /> Tiempo restante 00:24
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-500">Tu oferta</p>
          <div className="flex gap-1.5">
            {QUICK_BIDS.map((bid) => (
              <span
                key={bid}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {bid}
              </span>
            ))}
          </div>
          <div className="rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm">
            Ofertar
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'ofertas-recientes',
    label: 'Ofertas recientes',
    urlLabel: 'app.rematar.com/remates/sala',
    content: (
      <>
        <Eyebrow>Ofertas recientes</Eyebrow>
        <div className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-2">
          <BadgeCheck className="h-4 w-4 shrink-0 text-success-600" />
          <div className="text-xs leading-tight">
            <p className="font-semibold text-success-700">Comprador verificado</p>
            <p className="text-success-600">Lidera con $19.400</p>
          </div>
        </div>
        <ul className="mt-1 flex-1">
          {RECENT_OFFERS.map((offer) => (
            <li key={offer.amount} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0">
              <div>
                <p className="font-mono font-semibold tabular-nums text-slate-900">{offer.amount}</p>
                <p className="text-[11px] text-slate-400">{offer.time}</p>
              </div>
              <Badge variant={offer.variant}>{offer.label}</Badge>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    key: 'lotes-del-remate',
    label: 'Lotes del remate',
    urlLabel: 'app.rematar.com/remates/estancia-la-elena',
    content: (
      <>
        <Eyebrow>Lotes del remate</Eyebrow>
        <div className="mt-2.5 flex flex-1 gap-2">
          {LOTES_DEL_REMATE.map((lote) => (
            <div key={lote.number} className="flex w-1/3 flex-col gap-1.5">
              <CoverBox className="aspect-square w-full" icon={<Boxes className="h-6 w-6 text-brand-300" />} />
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Lote {lote.number}</p>
              <Badge variant={lote.variant} className="w-fit">
                {lote.label}
              </Badge>
              <p className="truncate text-xs text-slate-600">{lote.title}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    key: 'remates-totales',
    label: 'Remates totales',
    urlLabel: 'app.rematar.com/remates',
    content: (
      <>
        <Eyebrow>Tus remates</Eyebrow>
        <ul className="mt-2.5 flex-1 space-y-2">
          {MIS_REMATES.map((remate) => (
            <li key={remate.title} className="flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-100">
              <CoverBox className="h-10 w-14" icon={<Boxes className="h-4 w-4 text-brand-300" />} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900">{remate.title}</p>
                <p className="truncate text-[10px] uppercase tracking-wide text-brand-600">{remate.category}</p>
              </div>
              <div className="shrink-0 text-right">
                <Badge variant={remate.variant}>{remate.label}</Badge>
                <p className="mt-1 text-[10px] text-slate-400">{remate.date}</p>
              </div>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    key: 'mis-compras',
    label: 'Mis compras adjudicadas',
    urlLabel: 'app.rematar.com/mis-compras/lote-14',
    content: (
      <>
        <Eyebrow>Seguimiento de mi compra</Eyebrow>
        <div className="mt-2.5 flex items-start gap-3 rounded-xl bg-brand-50/60 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-inset ring-brand-100">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">Qué sigue</p>
            <p className="text-sm font-semibold text-slate-900">Pago pendiente</p>
            <p className="text-xs leading-snug text-slate-500">Coordiná el pago con el martillero para avanzar.</p>
          </div>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2">
          <StatTile label="Precio final" value="$19.400" />
          <StatTile label="Adjudicado" value="24 ago 2026" />
          <StatTile label="Remate" value="Estancia La Elena" />
          <StatTile label="Lote" value="Lote 14" />
        </div>
      </>
    ),
  },
];

/**
 * Visual de la sección "Beneficios para compradores" (`BenefitsSection` en
 * `LandingPage`) -- recreación con `RotatingMockup` de las pantallas que un comprador
 * realmente usa (chat, panel para ofertar, ofertas recientes, lotes del remate, listado
 * de remates y seguimiento post-remate), no una única captura o video (ver
 * `RotatingMockup` para el porqué).
 */
export function CompradorMockup() {
  return <RotatingMockup scenes={SCENES} />;
}
