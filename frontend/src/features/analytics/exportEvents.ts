/**
 * Export CSV, 100% client-side, de la línea de tiempo de eventos del panel de analítica
 * (`AnalyticsPanel`) -- usa nada más que `recent_events`, ya cargado en el snapshot, sin
 * pedir nada nuevo al backend. A diferencia de `features/history/export.ts` (PDF/Excel
 * del informe ejecutivo, con `jsPDF`/`exceljs`), acá alcanza un CSV plano armado a mano:
 * no hay tabla financiera ni formato que justifique esas dependencias para una lista de
 * eventos con 4 columnas.
 */

import { formatCurrency, formatDateTime } from '../../shared/lib/format';
import { RECENT_EVENT_LABELS } from './labels';
import type { RecentAnalyticsEvent } from './types';

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportRecentEventsToCsv(
  events: RecentAnalyticsEvent[],
  remateId: string,
  currency: string,
): void {
  const header = ['Evento', 'Lote', 'Fecha y hora', 'Precio final'];
  const rows = events.map((event) => [
    RECENT_EVENT_LABELS[event.event_type],
    event.lot_number ?? '',
    formatDateTime(event.occurred_at),
    event.final_price != null ? formatCurrency(event.final_price, currency) : '',
  ]);
  // BOM inicial -- Excel abre un CSV UTF-8 sin BOM asumiendo la codificación del sistema
  // operativo y rompe las tildes de las etiquetas ("Lote abierto" -> "Lote abi​erto").
  const csv = '﻿' + [header, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `analitica-eventos-${remateId}.csv`);
}
