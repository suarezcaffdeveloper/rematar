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
import { formatCurrency, formatDateTime, formatDuration } from '../../shared/lib/format';
import { CATEGORY_LABELS, LOTE_STATUS_LABELS, STATUS_LABELS } from '../remates/labels';
import { STATUS_LABELS as POSTAUCTION_STATUS_LABELS } from '../postauction/labels';
import type { Lote, Remate } from '../remates/types';
import type { PostAuctionCase } from '../postauction/types';
import type { LoteHistoryDetail, RemateHistoryDetail } from './types';

type RGB = [number, number, number];

/** Paleta de marca (`src/styles/index.css`) traducida a RGB para `jsPDF` -- no hay forma
 * de leer variables CSS desde acá, así que se copian a mano los tonos que usa el
 * informe (`brand-600`/`brand-700` del wordmark/acentos, `ink*` del texto,
 * `success-700`/`danger-600` para variaciones positivas/negativas). Tipadas como
 * tuplas mutables (no `as const`) para que calcen tal cual con `jspdf-autotable`'s
 * `Color` (`[number, number, number] | number | string | false`) sin castear en cada uso. */
const PDF_COLORS: {
  brandDark: RGB;
  brand: RGB;
  ink: RGB;
  inkMuted: RGB;
  inkFaint: RGB;
  line: RGB;
  positive: RGB;
  negative: RGB;
} = {
  brandDark: [27, 63, 196],
  brand: [36, 81, 242],
  ink: [16, 17, 20],
  inkMuted: [107, 111, 118],
  inkFaint: [162, 165, 171],
  line: [231, 231, 234],
  positive: [22, 101, 52],
  negative: [185, 28, 28],
};

const PDF_MARGIN_X = 14;

const PERCENT_FORMATTER = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatSignedCurrency(amount: number, currency: string): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${formatCurrency(String(Math.abs(amount)), currency)}`;
}

function formatSignedPercentage(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${PERCENT_FORMATTER.format(Math.abs(value))}%`;
}

function formatLoteVariacion(basePrice: number, finalPrice: number | null): string {
  if (finalPrice == null || basePrice <= 0) return '—';
  return formatSignedPercentage(((finalPrice - basePrice) / basePrice) * 100);
}

/** `numFmt` de Excel para montos -- separador de miles + código ISO como sufijo en vez
 * de un símbolo localizado: Excel resuelve `"$"` según la configuración regional de
 * quien abre el archivo, y acá el monto siempre tiene que leerse en la moneda del
 * remate (`Remate.settings.currency`), no en la del sistema operativo de quien lo abre.
 * Sin decimales -- mismo criterio que `formatCurrency` (`shared/lib/format.ts`): los
 * montos de este dominio siempre son redondos. */
function currencyNumFmt(currency: string): string {
  return `#,##0 "${currency}"`;
}

/** RGB (`PDF_COLORS`) a ARGB de Excel -- una sola fuente de verdad para que la paleta
 * del Excel (secciones de "Resumen") sea la misma que la del PDF. */
function toArgb([r, g, b]: RGB): string {
  return 'FF' + [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** No hay un ID corto/secuencial en el backend (`Remate.id` es un UUID) -- se deriva un
 * código de presentación estable a partir de él, solo para el membrete/pie del PDF. */
function formatRemateDisplayId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `REM-${cleaned.slice(0, 6).padStart(6, '0')}`;
}

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

interface LotesSheetRow {
  id: string;
  lot_number: string;
  title: string;
  status: string;
  base_price: number;
  final_price: number | null;
  difference_amount: number | null;
  difference_percentage: number | null;
  offer_count: number | null;
  winner_name: string;
  adjudication_status: string;
  payment_status: string;
}

/** Filas de la hoja "Lotes" del Excel -- variante de `buildLoteRows` con más columnas
 * (ID, diferencia/incremento numéricos, estado de adjudicación/pago) que no tiene
 * sentido meter en la tabla "RESULTADO POR LOTE" del PDF (más compacta, pensada para
 * lectura, no para filtrar/ordenar). Valores numéricos en vez de strings formateados:
 * así Excel puede aplicar `numFmt` real y el usuario puede ordenar/filtrar por precio,
 * no por texto. */
function buildLotesSheetRows(bundle: RemateHistoryExportBundle): LotesSheetRow[] {
  return bundle.lotes.map((lote) => {
    const offerDetail = bundle.offerResults.get(lote.id);
    const postAuctionCase = bundle.casesByLoteId.get(lote.id);
    const winnerName = postAuctionCase?.buyer_name ?? offerDetail?.winner?.buyer_name ?? null;
    const basePrice = Number(lote.base_price);
    const finalPrice = lote.final_price != null ? Number(lote.final_price) : null;
    const differenceAmount = finalPrice != null ? finalPrice - basePrice : null;
    const differencePercentage =
      finalPrice != null && basePrice > 0 ? (finalPrice - basePrice) / basePrice : null;

    return {
      id: lote.id,
      lot_number: lote.lot_number,
      title: lote.title,
      status: LOTE_STATUS_LABELS[lote.status],
      base_price: basePrice,
      final_price: finalPrice,
      difference_amount: differenceAmount,
      difference_percentage: differencePercentage,
      offer_count: offerDetail ? offerDetail.offer_count : null,
      winner_name: winnerName ?? '—',
      adjudication_status: postAuctionCase ? POSTAUCTION_STATUS_LABELS[postAuctionCase.status] : '—',
      payment_status: postAuctionCase ? (postAuctionCase.payment_at ? 'Pagado' : 'Pendiente') : '—',
    };
  });
}

interface AdjudicacionSheetRow {
  lot_number: string;
  title: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  final_price: number;
  adjudication_status: string;
  payment_status: string;
}

/** Filas de la hoja "Adjudicaciones" -- una por lote con caso post-remate
 * (`casesByLoteId`, `PostAuctionCaseRematadorRead`), la única fuente con contacto del
 * comprador a nivel remate (`LoteHistoryDetail.winner` solo lo tiene por lote, y acá se
 * usa nada más como respaldo si el caso no llegó a resolver el nombre/contacto). Lotes
 * sin adjudicación (sin ofertas, desiertos, cancelados) no generan fila -- no hay
 * "adjudicación" que listar. */
function buildAdjudicacionRows(bundle: RemateHistoryExportBundle): AdjudicacionSheetRow[] {
  const rows: AdjudicacionSheetRow[] = [];
  for (const lote of bundle.lotes) {
    const postAuctionCase = bundle.casesByLoteId.get(lote.id);
    if (!postAuctionCase) continue;
    const offerDetail = bundle.offerResults.get(lote.id);
    rows.push({
      lot_number: lote.lot_number,
      title: lote.title,
      buyer_name: postAuctionCase.buyer_name ?? offerDetail?.winner?.buyer_name ?? 'No registrado',
      buyer_email: postAuctionCase.buyer_email ?? offerDetail?.winner?.buyer_email ?? 'No registrado',
      buyer_phone: postAuctionCase.buyer_phone ?? offerDetail?.winner?.buyer_phone ?? 'No registrado',
      final_price: Number(postAuctionCase.final_price),
      adjudication_status: POSTAUCTION_STATUS_LABELS[postAuctionCase.status],
      payment_status: postAuctionCase.payment_at ? 'Pagado' : 'Pendiente',
    });
  }
  return rows;
}

/** Lotes "relevantes" (los que `useLoteResultsForRemate` sí resolvió) que terminaron
 * con cero ofertas -- mismo criterio que "Lotes sin ofertas" del PDF
 * (`buildPdfIndicatorRows`), separado acá para no acoplar la hoja "Resumen" del Excel
 * al builder de strings formateados del PDF. */
function getZeroOfferLotes(bundle: RemateHistoryExportBundle): Lote[] {
  return bundle.lotes.filter((lote) => bundle.offerResults.get(lote.id)?.offer_count === 0);
}

/** Filas financieras de "Resumen del remate" en el PDF -- separadas de
 * `buildSummaryRows` (que alimenta la hoja "Resumen" del Excel) porque el informe PDF
 * pide más detalle (base total, incremento en $ y %) del que tiene sentido en la
 * planilla. */
function buildPdfFinancialRows(bundle: RemateHistoryExportBundle): { label: string; value: string }[] {
  const { detail, lotes, currency } = bundle;
  const soldLotes = lotes.filter((lote) => lote.final_price != null);
  const totalBasePrice = soldLotes.reduce((sum, lote) => sum + Number(lote.base_price), 0);
  const totalAwardedValue = Number(detail.total_awarded_value);
  const differenceAmount = totalAwardedValue - totalBasePrice;
  const differencePercentage = totalBasePrice > 0 ? (differenceAmount / totalBasePrice) * 100 : null;

  return [
    { label: 'Valor base total', value: formatCurrency(String(totalBasePrice), currency) },
    { label: 'Valor adjudicado', value: formatCurrency(String(totalAwardedValue), currency) },
    {
      label: 'Incremento',
      value:
        formatSignedCurrency(differenceAmount, currency) +
        (differencePercentage != null ? ` (${formatSignedPercentage(differencePercentage)})` : ''),
    },
  ];
}

/** Filas operativas de "Resumen del remate" en el PDF (segundo bloque, debajo de las
 * financieras). */
function buildPdfOperationalRows(bundle: RemateHistoryExportBundle): { label: string; value: string }[] {
  const { detail } = bundle;
  const { closed_sold: closedSold, total } = detail.lote_status_counts;
  const soldPercentage = total > 0 ? Math.round((closedSold / total) * 100) : null;

  return [
    {
      label: 'Lotes vendidos',
      value: `${closedSold} / ${total}${soldPercentage != null ? ` (${soldPercentage}%)` : ''}`,
    },
    { label: 'Participantes', value: String(detail.participants_count) },
    { label: 'Total de ofertas', value: String(detail.total_ofertas) },
    {
      label: 'Duración',
      value: detail.duration_seconds != null ? formatDuration(detail.duration_seconds * 1000) : '—',
    },
  ];
}

/** Filas de "Indicadores" del PDF -- "Lotes sin ofertas" lista todos los lotes con
 * `offer_count === 0` (no solo los desiertos, a diferencia de
 * `RemateAnalysis.unsoldWithoutOffersLote`), porque acá el indicador es sobre
 * participación, no sobre el resultado comercial del lote. */
function buildPdfIndicatorRows(bundle: RemateHistoryExportBundle): { label: string; value: string }[] {
  const { detail, lotes, offerResults, currency } = bundle;
  const { highest_oferta: highestOferta, top_lote_by_offers: topLote } = detail;

  const zeroOfferLotes = lotes.filter((lote) => offerResults.get(lote.id)?.offer_count === 0);

  return [
    {
      label: 'Mayor precio final',
      value: highestOferta
        ? `${formatCurrency(highestOferta.amount, currency)} — Lote ${highestOferta.lot_number}`
        : '—',
    },
    {
      label: 'Mayor cantidad de ofertas',
      value: topLote ? `${topLote.offer_count} — Lote ${topLote.lot_number}` : '—',
    },
    {
      label: 'Lotes sin ofertas',
      value: zeroOfferLotes.length > 0 ? zeroOfferLotes.map((lote) => `Lote ${lote.lot_number}`).join(', ') : 'Ninguno',
    },
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

/**
 * Membrete: marca "RematAR" (isotipo dibujado a mano -- no hay ningún asset de logo en
 * el repo, ver `Sidebar.tsx`, que tampoco usa uno) + wordmark, con el título del informe
 * alineado a la derecha. Devuelve el `y` donde puede empezar el siguiente bloque.
 */
function drawPdfLetterhead(doc: jsPDF, pageWidth: number): number {
  const { brandDark, ink, inkMuted, line } = PDF_COLORS;

  doc.setFillColor(...brandDark);
  doc.roundedRect(PDF_MARGIN_X, 12, 10, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('R', PDF_MARGIN_X + 5, 17.3, { align: 'center', baseline: 'middle' });

  doc.setFontSize(16);
  doc.setTextColor(...ink);
  doc.text('RematAR', PDF_MARGIN_X + 14, 17.3, { baseline: 'middle' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...inkMuted);
  doc.text('INFORME DE CIERRE DEL REMATE', pageWidth - PDF_MARGIN_X, 15, {
    align: 'right',
    charSpace: 0.4,
  });

  doc.setDrawColor(...line);
  doc.setLineWidth(0.4);
  doc.line(PDF_MARGIN_X, 26, pageWidth - PDF_MARGIN_X, 26);

  return 26;
}

/** Título del remate + metadata (categoría/estado, fecha, ubicación, ID) debajo del
 * membrete. Devuelve el `y` donde puede empezar la primera tabla. */
function drawPdfRemateMeta(doc: jsPDF, bundle: RemateHistoryExportBundle, afterY: number): number {
  const { remate } = bundle;
  const { ink, inkMuted, inkFaint } = PDF_COLORS;
  let y = afterY + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ink);
  doc.text(remate.title, PDF_MARGIN_X, y);

  const resolvedAt = remate.finished_at ?? remate.cancelled_at ?? remate.starts_at;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...inkMuted);

  y += 7;
  doc.text(`${CATEGORY_LABELS[remate.category]} · ${STATUS_LABELS[remate.status]}`, PDF_MARGIN_X, y);

  if (resolvedAt) {
    y += 5.5;
    doc.text(formatDateTime(resolvedAt), PDF_MARGIN_X, y);
  }

  if (remate.location) {
    y += 5.5;
    doc.text(remate.location, PDF_MARGIN_X, y);
  }

  y += 5.5;
  doc.setFontSize(8.5);
  doc.setTextColor(...inkFaint);
  doc.text(`ID: ${formatRemateDisplayId(remate.id)}`, PDF_MARGIN_X, y);

  return y + 6;
}

/** Título de sección ("RESUMEN DEL REMATE", etc.): barrita de acento + texto en mayúsculas. */
function drawPdfSectionHeading(doc: jsPDF, text: string, y: number): number {
  const { brand, ink } = PDF_COLORS;
  doc.setFillColor(...brand);
  doc.rect(PDF_MARGIN_X, y - 3.2, 2.6, 3.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text(text, PDF_MARGIN_X + 6, y, { charSpace: 0.3 });
  return y + 6;
}

type AutoTableEndY = { lastAutoTable: { finalY: number } };

/** Bloque de pares label/valor ("Resumen"/"Indicadores"): una `autoTable` sin encabezado,
 * la columna de valor alineada a la derecha del ancho de contenido. */
function drawPdfLedgerTable(
  doc: jsPDF,
  rows: { label: string; value: string }[],
  startY: number,
  pageWidth: number,
  highlightRowIndex?: number,
): number {
  const contentWidth = pageWidth - PDF_MARGIN_X * 2;
  autoTable(doc, {
    startY,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X },
    body: rows.map((row) => [row.label, row.value]),
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.5, textColor: PDF_COLORS.inkMuted },
      1: { cellWidth: contentWidth * 0.5, halign: 'right', fontStyle: 'bold', textColor: PDF_COLORS.ink },
    },
    didParseCell: (data) => {
      if (highlightRowIndex != null && data.column.index === 1 && data.row.index === highlightRowIndex) {
        const raw = String(data.cell.raw ?? '');
        if (raw.startsWith('+')) data.cell.styles.textColor = PDF_COLORS.positive;
        else if (raw.startsWith('-')) data.cell.styles.textColor = PDF_COLORS.negative;
      }
    },
  });
  return (doc as unknown as AutoTableEndY).lastAutoTable.finalY;
}

export function exportRemateHistoryToPdf(bundle: RemateHistoryExportBundle): void {
  const { remate, detail } = bundle;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawPdfLetterhead(doc, pageWidth);
  y = drawPdfRemateMeta(doc, bundle, y);

  y = drawPdfSectionHeading(doc, 'RESUMEN DEL REMATE', y);
  y = drawPdfLedgerTable(doc, buildPdfFinancialRows(bundle), y, pageWidth, 2) + 4;
  y = drawPdfLedgerTable(doc, buildPdfOperationalRows(bundle), y, pageWidth) + 8;

  y = drawPdfSectionHeading(doc, 'RESULTADO POR LOTE', y);
  autoTable(doc, {
    startY: y,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X },
    head: [['Lote', 'Título', 'Estado', 'Base', 'Final', 'Variación', 'Ganador', 'Ofertas']],
    body: buildLoteRows(bundle).map((row) => [
      row.lot_number,
      row.title,
      row.status,
      formatCurrency(String(row.base_price), bundle.currency),
      row.final_price != null ? formatCurrency(String(row.final_price), bundle.currency) : '—',
      formatLoteVariacion(row.base_price, row.final_price),
      row.winner_name,
      row.offer_count,
    ]),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: PDF_COLORS.brandDark, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { cellWidth: 17 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 14, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const raw = String(data.cell.raw ?? '');
        if (raw.startsWith('+')) data.cell.styles.textColor = PDF_COLORS.positive;
        else if (raw.startsWith('-')) data.cell.styles.textColor = PDF_COLORS.negative;
        else data.cell.styles.textColor = PDF_COLORS.inkFaint;
      }
    },
  });
  y = (doc as unknown as AutoTableEndY).lastAutoTable.finalY + 8;

  y = drawPdfSectionHeading(doc, 'INDICADORES', y);
  drawPdfLedgerTable(doc, buildPdfIndicatorRows(bundle), y, pageWidth);

  const displayId = formatRemateDisplayId(remate.id);
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setLineWidth(0.3);
    doc.line(PDF_MARGIN_X, pageHeight - 16, pageWidth - PDF_MARGIN_X, pageHeight - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.inkMuted);
    doc.text(`Informe generado el ${formatDateTime(detail.generated_at)} · RematAR`, pageWidth / 2, pageHeight - 11, {
      align: 'center',
    });
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.inkFaint);
    doc.text(`ID del remate: ${displayId}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
  }

  doc.save(`historial-${slugify(remate.title)}.pdf`);
}

const EXCEL_SECTION_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};

type ResumenCellValue = string | number | Date | null | undefined;

/** Bloque de sección + pares label/valor de la hoja "Resumen" -- misma estructura
 * visual que el "ledger" del PDF (título de sección + label/valor), adaptada al layout
 * de dos columnas de una hoja de cálculo. `field` ignora valores `null`/`undefined`:
 * así cada sección solo muestra los indicadores que efectivamente existen para este
 * remate (ver comentario de `writeResumenSheet` sobre "no inventar datos"). */
function createResumenWriter(sheet: ExcelJS.Worksheet) {
  let row = 1;

  function section(title: string): void {
    const excelRow = sheet.getRow(row);
    sheet.mergeCells(row, 1, row, 2);
    const cell = excelRow.getCell(1);
    cell.value = title;
    cell.font = { bold: true, size: 11, color: { argb: toArgb(PDF_COLORS.brandDark) } };
    cell.alignment = { vertical: 'middle' };
    cell.fill = EXCEL_SECTION_FILL;
    excelRow.getCell(2).fill = EXCEL_SECTION_FILL;
    excelRow.height = 20;
    row += 1;
  }

  function field(label: string, value: ResumenCellValue, numFmt?: string): void {
    if (value == null) return;
    const excelRow = sheet.getRow(row);
    excelRow.getCell(1).value = label;
    excelRow.getCell(1).font = { color: { argb: toArgb(PDF_COLORS.inkMuted) } };
    const valueCell = excelRow.getCell(2);
    valueCell.value = value;
    valueCell.font = { bold: true, color: { argb: toArgb(PDF_COLORS.ink) } };
    valueCell.alignment = { horizontal: 'right' };
    if (numFmt) valueCell.numFmt = numFmt;
    row += 1;
  }

  function blank(): void {
    row += 1;
  }

  return { section, field, blank };
}

/**
 * Hoja "Resumen" -- presentación estructurada del remate en cuatro secciones
 * (identificación, resultados económicos, resultados del remate, indicadores
 * destacados), a partir de los mismos datos reales que ya usan el PDF y la vista web
 * (`RemateHistoryDetail`, `Lote[]`). No inventa métricas nuevas: cada campo que no
 * exista para este remate (`highest_oferta`/`top_lote_by_offers` nulos, sin ubicación,
 * etc.) simplemente no genera fila (`field` ignora `null`).
 */
function writeResumenSheet(workbook: ExcelJS.Workbook, bundle: RemateHistoryExportBundle): void {
  const { remate, detail, lotes, currency } = bundle;
  const sheet = workbook.addWorksheet('Resumen');
  sheet.getColumn(1).width = 38;
  sheet.getColumn(2).width = 30;

  const writer = createResumenWriter(sheet);
  const resolvedAt = remate.finished_at ?? remate.cancelled_at ?? remate.starts_at;

  writer.section('IDENTIFICACIÓN');
  writer.field('ID del remate', formatRemateDisplayId(remate.id));
  writer.field('Nombre', remate.title);
  writer.field('Categoría', CATEGORY_LABELS[remate.category]);
  writer.field('Estado', STATUS_LABELS[remate.status]);
  writer.field('Fecha', resolvedAt ? new Date(resolvedAt) : null, 'dd/mm/yyyy');
  writer.field('Hora', resolvedAt ? new Date(resolvedAt) : null, 'hh:mm');
  writer.field('Ubicación', remate.location);
  writer.field('Fecha de generación del informe', new Date(detail.generated_at), 'dd/mm/yyyy hh:mm');
  writer.blank();

  const soldLotes = lotes.filter((lote) => lote.final_price != null);
  const totalBasePrice = soldLotes.reduce((sum, lote) => sum + Number(lote.base_price), 0);
  const totalAwardedValue = Number(detail.total_awarded_value);
  const differenceAmount = totalAwardedValue - totalBasePrice;
  const differencePercentage = totalBasePrice > 0 ? differenceAmount / totalBasePrice : null;
  const { closed_sold: closedSold, total: totalLotes } = detail.lote_status_counts;
  const averageAwardedPerLote = closedSold > 0 ? totalAwardedValue / closedSold : null;

  writer.section('RESULTADOS ECONÓMICOS');
  writer.field('Valor base total', totalBasePrice, currencyNumFmt(currency));
  writer.field('Valor total adjudicado', totalAwardedValue, currencyNumFmt(currency));
  writer.field('Diferencia obtenida', differenceAmount, currencyNumFmt(currency));
  writer.field('Porcentaje de incremento sobre valor base', differencePercentage, '0.0%');
  writer.field('Promedio adjudicado por lote', averageAwardedPerLote, currencyNumFmt(currency));
  writer.field(
    'Mayor precio final',
    detail.highest_oferta ? Number(detail.highest_oferta.amount) : null,
    currencyNumFmt(currency),
  );
  writer.blank();

  const zeroOffer = getZeroOfferLotes(bundle);
  const soldPercentage = totalLotes > 0 ? closedSold / totalLotes : null;
  const averageOffersPerLote = totalLotes > 0 ? detail.total_ofertas / totalLotes : null;

  writer.section('RESULTADOS DEL REMATE');
  writer.field('Total de lotes', totalLotes, '#,##0');
  writer.field('Lotes vendidos', closedSold, '#,##0');
  writer.field('Lotes sin ofertas', zeroOffer.length, '#,##0');
  writer.field('Porcentaje de lotes vendidos', soldPercentage, '0.0%');
  writer.field('Total de ofertas', detail.total_ofertas, '#,##0');
  writer.field('Promedio de ofertas por lote', averageOffersPerLote, '0.0');
  writer.field('Participantes', detail.participants_count, '#,##0');
  writer.field(
    'Duración total',
    detail.duration_seconds != null ? formatDuration(detail.duration_seconds * 1000) : null,
  );
  writer.blank();

  writer.section('INDICADORES DESTACADOS');
  writer.field(
    'Lote con mayor precio final',
    detail.highest_oferta ? `Lote ${detail.highest_oferta.lot_number} — ${detail.highest_oferta.lote_title}` : null,
  );
  writer.field(
    'Valor del mayor precio final',
    detail.highest_oferta ? Number(detail.highest_oferta.amount) : null,
    currencyNumFmt(currency),
  );
  writer.field(
    'Lote con mayor cantidad de ofertas',
    detail.top_lote_by_offers
      ? `Lote ${detail.top_lote_by_offers.lot_number} — ${detail.top_lote_by_offers.lote_title}`
      : null,
  );
  writer.field(
    'Cantidad de ofertas del lote con mayor actividad',
    detail.top_lote_by_offers ? detail.top_lote_by_offers.offer_count : null,
    '#,##0',
  );
  writer.field(
    'Lote sin ofertas',
    zeroOffer.length > 0 ? zeroOffer.map((lote) => `Lote ${lote.lot_number}`).join(', ') : 'Ninguno',
  );
}

function applyExcelTableColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

/**
 * Hoja "Lotes" -- una tabla real de Excel (`addTable`, con filtro por columna y
 * encabezado congelado), una fila por lote. Igual que la hoja "Resumen", nada de datos
 * inventados: `offer_count`/estado de adjudicación quedan en blanco (`null`) cuando no
 * hay dato resuelto para ese lote, en vez de mostrar un cero o un estado que no se
 * puede afirmar.
 */
function writeLotesSheet(workbook: ExcelJS.Workbook, bundle: RemateHistoryExportBundle): void {
  const sheet = workbook.addWorksheet('Lotes', { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns = [
    { name: 'ID de lote', width: 12 },
    { name: 'Lote', width: 8 },
    { name: 'Título', width: 32 },
    { name: 'Estado', width: 16 },
    { name: 'Precio base', width: 16 },
    { name: 'Precio final', width: 16 },
    { name: 'Diferencia', width: 16 },
    { name: 'Incremento %', width: 14 },
    { name: 'Ofertas', width: 10 },
    { name: 'Ganador', width: 26 },
    { name: 'Estado de adjudicación', width: 22 },
    { name: 'Estado de pago', width: 16 },
  ];

  sheet.addTable({
    name: 'TablaLotes',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: columns.map((column) => ({ name: column.name, filterButton: true })),
    rows: buildLotesSheetRows(bundle).map((row) => [
      row.id,
      row.lot_number,
      row.title,
      row.status,
      row.base_price,
      row.final_price,
      row.difference_amount,
      row.difference_percentage,
      row.offer_count,
      row.winner_name,
      row.adjudication_status,
      row.payment_status,
    ]),
  });

  applyExcelTableColumnWidths(
    sheet,
    columns.map((column) => column.width),
  );
  sheet.getColumn(5).numFmt = currencyNumFmt(bundle.currency);
  sheet.getColumn(6).numFmt = currencyNumFmt(bundle.currency);
  sheet.getColumn(7).numFmt = currencyNumFmt(bundle.currency);
  sheet.getColumn(8).numFmt = '0.0%';
  sheet.getColumn(9).numFmt = '#,##0';
  sheet.getColumn(3).alignment = { wrapText: true, vertical: 'middle' };
}

/**
 * Hoja "Adjudicaciones" -- tabla real de Excel orientada a gestión comercial (contacto
 * del comprador, estado de pago), una fila por lote adjudicado (`buildAdjudicacionRows`
 * ya filtra los que no tienen caso post-remate). Vacía -- solo encabezado -- si el
 * remate no tuvo ninguna adjudicación.
 */
function writeAdjudicacionesSheet(workbook: ExcelJS.Workbook, bundle: RemateHistoryExportBundle): void {
  const sheet = workbook.addWorksheet('Adjudicaciones', { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns = [
    { name: 'Lote', width: 8 },
    { name: 'Título', width: 32 },
    { name: 'Comprador', width: 26 },
    { name: 'Email', width: 30 },
    { name: 'Teléfono', width: 18 },
    { name: 'Precio final', width: 16 },
    { name: 'Estado de adjudicación', width: 22 },
    { name: 'Estado de pago', width: 16 },
  ];

  sheet.addTable({
    name: 'TablaAdjudicaciones',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: columns.map((column) => ({ name: column.name, filterButton: true })),
    rows: buildAdjudicacionRows(bundle).map((row) => [
      row.lot_number,
      row.title,
      row.buyer_name,
      row.buyer_email,
      row.buyer_phone,
      row.final_price,
      row.adjudication_status,
      row.payment_status,
    ]),
  });

  applyExcelTableColumnWidths(
    sheet,
    columns.map((column) => column.width),
  );
  sheet.getColumn(6).numFmt = currencyNumFmt(bundle.currency);
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'middle' };
}

/**
 * Excel del informe ejecutivo -- registro analítico/operativo del remate, complementario
 * al PDF (pensado para leer/archivar, no para trabajar los datos). Tres hojas:
 * "Resumen" (KPIs estructurados), "Lotes" (tabla filtrable de resultado por lote) y
 * "Adjudicaciones" (gestión comercial: comprador, contacto, estado de pago). Sin hoja
 * de "Participantes": el sistema solo conoce `participants_count` (un número), no un
 * registro por participante con ofertas/lotes/contacto -- inventar esas filas violaría
 * "no inventar datos" (ver `docs/37-historial-y-resultados-de-remates.md`). Sin hoja de
 * "Pujas": `offer_history` de `LoteHistoryDetail` solo se carga 1 oferta por lote acá
 * (`useLoteResultsForRemate` pide `page_size=1`, ver `features/history/hooks.ts`), no
 * el historial completo -- traerlo entero para cada lote es una funcionalidad aparte,
 * no algo para colar en el resumen estándar.
 */
export async function exportRemateHistoryToExcel(bundle: RemateHistoryExportBundle): Promise<void> {
  const { remate } = bundle;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RematAR';
  workbook.created = new Date();

  writeResumenSheet(workbook, bundle);
  writeLotesSheet(workbook, bundle);
  writeAdjudicacionesSheet(workbook, bundle);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `historial-${slugify(remate.title)}.xlsx`);
}
