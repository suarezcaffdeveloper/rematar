import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { Lote, Remate } from '../remates/types';
import type { PostAuctionCase } from '../postauction/types';
import type { LoteHistoryDetail, RemateHistoryDetail } from './types';

const jsPdfInstance = {
  setFontSize: vi.fn(),
  setFont: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  roundedRect: vi.fn(),
  rect: vi.fn(),
  line: vi.fn(),
  setPage: vi.fn(),
  text: vi.fn(),
  save: vi.fn(),
  getNumberOfPages: vi.fn(() => 1),
  internal: { pageSize: { getHeight: () => 297, getWidth: () => 210 } },
  lastAutoTable: { finalY: 50 },
};

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function jsPDFMock() {
    return jsPdfInstance;
  }),
}));

const autoTableMock = vi.fn();
vi.mock('jspdf-autotable', () => ({ default: autoTableMock }));

// `exceljs` NO se mockea acá (a diferencia de `jspdf`): es JS puro, corre bien en el
// entorno `jsdom` de los tests, y mockear a mano toda la superficie que usa
// `export.ts` (`addTable`, `mergeCells`, `getRow`/`getCell`, `views`, `numFmt`...)
// sería más frágil que generar el `.xlsx` real y releerlo con la misma librería para
// verificar su contenido.
const { exportRemateHistoryToExcel, exportRemateHistoryToPdf } = await import('./export');

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de hacienda',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: 'Rosario, Santa Fe',
    starts_at: '2026-07-01T14:00:00Z',
    ends_at: null,
    status: 'finished',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: '2026-07-01T16:00:00Z',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-07-01T16:00:00Z',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<RemateHistoryDetail> = {}): RemateHistoryDetail {
  return {
    remate_id: 'remate-1',
    title: 'Remate de hacienda',
    category: 'hacienda',
    status: 'finished',
    starts_at: '2026-07-01T14:00:00Z',
    finished_at: '2026-07-01T16:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    duration_seconds: 7200,
    lote_status_counts: { total: 1, pending: 0, open: 0, closed_sold: 1, closed_unsold: 0, cancelled: 0 },
    average_lote_duration_seconds: 120,
    total_awarded_value: '1200.00',
    total_ofertas: 3,
    highest_oferta: null,
    top_lote_by_offers: null,
    chat_activity: { message_count: 0, deleted_count: 0, participant_count: 0 },
    participants_count: 2,
    generated_at: '2026-07-01T16:05:00Z',
    ...overrides,
  };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 1,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: '1200.00',
    status: 'closed_sold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: false,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeCase(overrides: Partial<PostAuctionCase> = {}): PostAuctionCase {
  return {
    id: 'case-1',
    lote_id: 'lote-1',
    lot_number: '1',
    lote_title: 'Toro Angus',
    lote_cover_image_url: null,
    remate_id: 'remate-1',
    remate_title: 'Remate de hacienda',
    buyer_id: 'buyer-1',
    buyer_name: 'Carlos Comprador',
    buyer_email: 'carlos@example.com',
    buyer_phone: '+5491122334455',
    rematador_id: 'owner-1',
    rematador_name: 'Ana Rematadora',
    base_price: '1000.00',
    final_price: '1200.00',
    status: 'pago_recibido',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeOfferDetail(overrides: Partial<LoteHistoryDetail> = {}): LoteHistoryDetail {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    title: 'Toro Angus',
    category: 'hacienda',
    status: 'closed_sold',
    base_price: '1000.00',
    final_price: '1200.00',
    winner: {
      buyer_id: 'buyer-1',
      buyer_name: 'Carlos Comprador',
      buyer_email: 'carlos@example.com',
      buyer_phone: '+5491122334455',
      amount: '1200.00',
    },
    offer_count: 3,
    time_open_seconds: 90,
    opened_at: null,
    closed_at: null,
    cancellation_reason: null,
    offer_history: { items: [], total: 0, page: 1, page_size: 1 },
    ...overrides,
  };
}

function makeBundle() {
  return {
    remate: makeRemate(),
    detail: makeDetail(),
    lotes: [makeLote()],
    offerResults: new Map([['lote-1', makeOfferDetail()]]),
    casesByLoteId: new Map([['lote-1', makeCase()]]),
    currency: 'ARS',
  };
}

describe('exportRemateHistoryToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('arma la tabla de lotes con el ganador, la variación y guarda el PDF con el nombre esperado', () => {
    exportRemateHistoryToPdf(makeBundle());

    expect(autoTableMock).toHaveBeenCalledTimes(4);
    const lotesTableCall = autoTableMock.mock.calls[2][1];
    expect(lotesTableCall.head).toEqual([
      ['Lote', 'Título', 'Estado', 'Base', 'Final', 'Variación', 'Ganador', 'Ofertas'],
    ]);
    expect(lotesTableCall.body).toEqual([
      ['1', 'Toro Angus', 'Vendido', '$ 1.000', '$ 1.200', '+20,0%', 'Carlos Comprador', '3'],
    ]);
    expect(jsPdfInstance.save).toHaveBeenCalledWith('historial-remate-de-hacienda.pdf');
  });
});

describe('exportRemateHistoryToExcel', () => {
  let capturedBlob: Blob | undefined;
  let downloadedFilename: string | undefined;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedBlob = undefined;
    downloadedFilename = undefined;
    (globalThis.URL as unknown as { createObjectURL: ReturnType<typeof vi.fn> }).createObjectURL = vi.fn(
      (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      },
    );
    (globalThis.URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download;
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  /** Genera el `.xlsx` con el bundle dado y lo relee con `exceljs` real -- así se
   * verifica el archivo tal como lo abriría Excel/LibreOffice, no una llamada mockeada. */
  async function exportAndReload(bundle: ReturnType<typeof makeBundle>) {
    await exportRemateHistoryToExcel(bundle);
    expect(capturedBlob).toBeDefined();
    const buffer = await capturedBlob!.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
  }

  it('dispara la descarga con el nombre esperado', async () => {
    await exportAndReload(makeBundle());
    expect(downloadedFilename).toBe('historial-remate-de-hacienda.xlsx');
  });

  it('arma las tres hojas (Resumen, Lotes, Adjudicaciones) en ese orden', async () => {
    const workbook = await exportAndReload(makeBundle());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Lotes', 'Adjudicaciones']);
  });

  it('la hoja Resumen trae identificación, resultados económicos y del remate sin inventar indicadores ausentes', async () => {
    const workbook = await exportAndReload(makeBundle());
    const sheet = workbook.getWorksheet('Resumen')!;
    const labels = new Map<string, ExcelJS.CellValue>();
    sheet.eachRow((row) => {
      const label = row.getCell(1).value;
      if (typeof label === 'string') labels.set(label, row.getCell(2).value);
    });

    expect(labels.get('Nombre')).toBe('Remate de hacienda');
    expect(labels.get('Categoría')).toBe('Hacienda y ganadería');
    expect(labels.get('Ubicación')).toBe('Rosario, Santa Fe');
    expect(labels.get('Valor total adjudicado')).toBe(1200);
    expect(labels.get('Total de lotes')).toBe(1);
    expect(labels.get('Lotes vendidos')).toBe(1);
    expect(labels.get('Participantes')).toBe(2);
    // Sin `highest_oferta`/`top_lote_by_offers` en el bundle -- no debe inventarse fila.
    expect(labels.has('Lote con mayor precio final')).toBe(false);
    expect(labels.has('Lote con mayor cantidad de ofertas')).toBe(false);
  });

  it('la hoja Lotes es una tabla real con filtro, encabezado congelado y formato de moneda/porcentaje', async () => {
    const workbook = await exportAndReload(makeBundle());
    const sheet = workbook.getWorksheet('Lotes')!;

    expect(sheet.views).toEqual([expect.objectContaining({ state: 'frozen', ySplit: 1 })]);
    // Tabla real de Excel (`ListObject`), no solo autofilter suelto -- `getTable`
    // devuelve el objeto (envuelto en `.table` tras un round-trip xlsx real, a
    // diferencia de cuando se acaba de crear con `addTable`) solo si el rango quedó
    // registrado como tabla en el archivo.
    expect((sheet.getTable('TablaLotes') as unknown as { table: { name: string } }).table.name).toBe(
      'TablaLotes',
    );
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'ID de lote',
      'Lote',
      'Título',
      'Estado',
      'Precio base',
      'Precio final',
      'Diferencia',
      'Incremento %',
      'Ofertas',
      'Ganador',
      'Estado de adjudicación',
      'Estado de pago',
    ]);
    expect(sheet.getRow(2).values).toEqual([
      undefined,
      'lote-1',
      '1',
      'Toro Angus',
      'Vendido',
      1000,
      1200,
      200,
      0.2,
      3,
      'Carlos Comprador',
      'Pago recibido',
      'Pendiente',
    ]);
    expect(sheet.getColumn(5).numFmt).toBe('#,##0 "ARS"');
    expect(sheet.getColumn(8).numFmt).toBe('0.0%');
  });

  it('la hoja Adjudicaciones trae contacto del comprador y usa "No registrado" cuando falta', async () => {
    const bundle = makeBundle();
    bundle.casesByLoteId.set('lote-1', makeCase({ buyer_phone: null }));
    // Sin teléfono tampoco en el respaldo (`offerResults[...].winner`) -- así se llega
    // de verdad al fallback final ("No registrado"), no a la segunda fuente.
    bundle.offerResults.set(
      'lote-1',
      makeOfferDetail({ winner: { ...makeOfferDetail().winner!, buyer_phone: null } }),
    );
    const workbook = await exportAndReload(bundle);
    const sheet = workbook.getWorksheet('Adjudicaciones')!;

    expect(
      (sheet.getTable('TablaAdjudicaciones') as unknown as { table: { name: string } }).table.name,
    ).toBe('TablaAdjudicaciones');
    expect(sheet.getRow(2).values).toEqual([
      undefined,
      '1',
      'Toro Angus',
      'Carlos Comprador',
      'carlos@example.com',
      'No registrado',
      1200,
      'Pago recibido',
      'Pendiente',
    ]);
  });

  it('omite lotes sin adjudicación en la hoja Adjudicaciones', async () => {
    const bundle = makeBundle();
    bundle.casesByLoteId.clear();
    const workbook = await exportAndReload(bundle);
    const sheet = workbook.getWorksheet('Adjudicaciones')!;
    expect(sheet.rowCount).toBe(1);
  });
});
