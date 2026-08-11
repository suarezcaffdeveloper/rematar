/**
 * Exportación del informe ejecutivo (`RemateHistoryDetailPage.tsx`) a PDF/Excel --
 * 100% client-side: toda la data ya está cargada en la página cuando el rematador la
 * ve (`remate`, `detail`, `lotes`, `offerResults`, `casesByLoteId`), así que no hace
 * falta ningún endpoint ni round-trip nuevo. Se descartó un renderer server-side
 * (`weasyprint`/`openpyxl`, sugerido en docs/37-historial-y-resultados-de-remates.md)
 * porque `weasyprint` necesita dependencias de sistema (Pango/Cairo) que no están en la
 * imagen Docker del backend -- un riesgo real de build por una funcionalidad que no lo
 * necesita.
 *
 * `jsPDF`/`jspdf-autotable`/`exceljs` son las únicas dependencias nuevas del proyecto en
 * mucho tiempo (ver ADR-027, "árbol de dependencias chico") -- se aceptan acá porque no
 * hay ningún equivalente nativo del navegador para generar bytes de PDF/XLSX, a
 * diferencia de `shared/lib/format.ts` (fechas/moneda), donde `Intl` alcanzaba.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { formatCurrency, formatDateTime } from '../../shared/lib/format';
import { CATEGORY_LABELS, LOTE_STATUS_LABELS, STATUS_LABELS } from '../remates/labels';
import type { Lote, Remate } from '../remates/types';
import type { PostAuctionCase } from '../postauction/types';
import type { LoteHistoryDetail, RemateHistoryDetail } from './types';

export interface RemateHistoryExportBundle {
  remate: Remate;
  detail: RemateHistoryDetail;
  lotes: Lote[];
  offerResults: Map<string, LoteHistoryDetail | null | undefined>;
  casesByLoteId: Map<string, PostAuctionCase>;
  currency: string;
}

interface LoteExportRow {
  lot_number: string;
  title: string;
  category: string;
  status: string;
  base_price: number;
  final_price: number | null;
  winner_name: string;
  winner_email: string;
  winner_phone: string;
  offer_count: string;
}

function buildLoteRows(bundle: RemateHistoryExportBundle): LoteExportRow[] {
  return bundle.lotes.map((lote) => {
    const offerDetail = bundle.offerResults.get(lote.id);
    const postAuctionCase = bundle.casesByLoteId.get(lote.id);
    const winnerName = postAuctionCase?.buyer_name ?? offerDetail?.winner?.buyer_name ?? null;
    const winnerEmail = postAuctionCase?.buyer_email ?? offerDetail?.winner?.buyer_email ?? null;
    const winnerPhone = postAuctionCase?.buyer_phone ?? offerDetail?.winner?.buyer_phone ?? null;
    return {
      lot_number: lote.lot_number,
      title: lote.title,
      category: CATEGORY_LABELS[lote.category],
      status: LOTE_STATUS_LABELS[lote.status],
      base_price: Number(lote.base_price),
      final_price: lote.final_price != null ? Number(lote.final_price) : null,
      winner_name: winnerName ?? '—',
      winner_email: winnerEmail ?? '—',
      winner_phone: winnerPhone ?? '—',
      offer_count: offerDetail ? String(offerDetail.offer_count) : '—',
    };
  });
}

function buildSummaryRows(bundle: RemateHistoryExportBundle): { label: string; value: string }[] {
  const { detail, currency } = bundle;
  return [
    { label: 'Valor total adjudicado', value: formatCurrency(detail.total_awarded_value, currency) },
    {
      label: 'Lotes vendidos',
      value: `${detail.lote_status_counts.closed_sold}/${detail.lote_status_counts.total}`,
    },
    { label: 'Participantes', value: String(detail.participants_count) },
    { label: 'Total de ofertas', value: String(detail.total_ofertas) },
  ];
}

/** `"Remate de hacienda"` -> `"remate-de-hacienda"`, para el nombre del archivo. */
function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      // eslint-disable-next-line no-misleading-character-class -- rango explícito de
      // marcas diacríticas combinantes (acentos), no un carácter suelto.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'remate'
  );
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

export function exportRemateHistoryToPdf(bundle: RemateHistoryExportBundle): void {
  const { remate, detail } = bundle;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('RematAR — Informe de remate', 14, 18);

  doc.setFontSize(11);
  doc.text(remate.title, 14, 27);
  doc.setFontSize(9);
  const resolvedAt = remate.finished_at ?? remate.cancelled_at ?? remate.starts_at;
  const metaLine = [
    CATEGORY_LABELS[remate.category],
    STATUS_LABELS[remate.status],
    resolvedAt ? formatDateTime(resolvedAt) : null,
    remate.location,
  ]
    .filter(Boolean)
    .join('  •  ');
  doc.text(metaLine, 14, 33);

  autoTable(doc, {
    startY: 40,
    head: [['Métrica', 'Valor']],
    body: buildSummaryRows(bundle).map((row) => [row.label, row.value]),
    theme: 'plain',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  const summaryTableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: summaryTableEnd + 8,
    head: [['Lote', 'Título', 'Estado', 'Precio base', 'Precio final', 'Ganador', 'Ofertas']],
    body: buildLoteRows(bundle).map((row) => [
      row.lot_number,
      row.title,
      row.status,
      formatCurrency(String(row.base_price), bundle.currency),
      row.final_price != null ? formatCurrency(String(row.final_price), bundle.currency) : '—',
      row.winner_name,
      row.offer_count,
    ]),
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.text(
        `Generado el ${formatDateTime(detail.generated_at)} — página ${pageCount}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      );
    },
  });

  doc.save(`historial-${slugify(remate.title)}.pdf`);
}

export async function exportRemateHistoryToExcel(bundle: RemateHistoryExportBundle): Promise<void> {
  const { remate } = bundle;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RematAR';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Resumen');
  summarySheet.columns = [
    { header: 'Métrica', key: 'label', width: 28 },
    { header: 'Valor', key: 'value', width: 24 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const row of buildSummaryRows(bundle)) {
    summarySheet.addRow(row);
  }

  const lotesSheet = workbook.addWorksheet('Lotes');
  lotesSheet.columns = [
    { header: 'Lote', key: 'lot_number', width: 8 },
    { header: 'Título', key: 'title', width: 30 },
    { header: 'Categoría', key: 'category', width: 18 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Precio base', key: 'base_price', width: 14 },
    { header: 'Precio final', key: 'final_price', width: 14 },
    { header: 'Ganador', key: 'winner_name', width: 24 },
    { header: 'Email', key: 'winner_email', width: 28 },
    { header: 'Teléfono', key: 'winner_phone', width: 18 },
    { header: 'Ofertas', key: 'offer_count', width: 10 },
  ];
  lotesSheet.getRow(1).font = { bold: true };
  for (const row of buildLoteRows(bundle)) {
    lotesSheet.addRow(row);
  }
  lotesSheet.getColumn('base_price').numFmt = '#,##0.00';
  lotesSheet.getColumn('final_price').numFmt = '#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `historial-${slugify(remate.title)}.xlsx`);
}
