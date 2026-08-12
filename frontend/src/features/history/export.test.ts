import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lote, Remate } from '../remates/types';
import type { PostAuctionCase } from '../postauction/types';
import type { LoteHistoryDetail, RemateHistoryDetail } from './types';

const jsPdfInstance = {
  setFontSize: vi.fn(),
  text: vi.fn(),
  save: vi.fn(),
  getNumberOfPages: vi.fn(() => 1),
  internal: { pageSize: { getHeight: () => 297 } },
  lastAutoTable: { finalY: 50 },
};

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function jsPDFMock() {
    return jsPdfInstance;
  }),
}));

const autoTableMock = vi.fn();
vi.mock('jspdf-autotable', () => ({ default: autoTableMock }));

const summarySheet = {
  columns: [] as unknown[],
  getRow: vi.fn(() => ({ font: {} })),
  addRow: vi.fn(),
  getColumn: vi.fn(() => ({ numFmt: undefined })),
};
const lotesSheet = {
  columns: [] as unknown[],
  getRow: vi.fn(() => ({ font: {} })),
  addRow: vi.fn(),
  getColumn: vi.fn(() => ({ numFmt: undefined })),
};
const addWorksheetMock = vi.fn((name: string) => (name === 'Resumen' ? summarySheet : lotesSheet));
const writeBufferMock = vi.fn(async () => new Uint8Array([1, 2, 3]));
const workbookInstance = {
  creator: '',
  created: undefined as Date | undefined,
  addWorksheet: addWorksheetMock,
  xlsx: { writeBuffer: writeBufferMock },
};

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn(function WorkbookMock() {
      return workbookInstance;
    }),
  },
}));

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

  it('arma la tabla de lotes con el ganador y guarda el PDF con el nombre esperado', () => {
    exportRemateHistoryToPdf(makeBundle());

    expect(autoTableMock).toHaveBeenCalledTimes(2);
    const lotesTableCall = autoTableMock.mock.calls[1][1];
    expect(lotesTableCall.body).toEqual([
      ['1', 'Toro Angus', 'Vendido', '$ 1.000,00', '$ 1.200,00', 'Carlos Comprador', '3'],
    ]);
    expect(jsPdfInstance.save).toHaveBeenCalledWith('historial-remate-de-hacienda.pdf');
  });
});

describe('exportRemateHistoryToExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summarySheet.addRow.mockClear();
    lotesSheet.addRow.mockClear();
    (globalThis.URL as unknown as { createObjectURL: ReturnType<typeof vi.fn> }).createObjectURL = vi.fn(
      () => 'blob:mock-url',
    );
    (globalThis.URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL = vi.fn();
  });

  it('arma las dos hojas y dispara la descarga con el nombre esperado', async () => {
    let downloadedFilename: string | undefined;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      });

    await exportRemateHistoryToExcel(makeBundle());

    expect(addWorksheetMock).toHaveBeenCalledWith('Resumen');
    expect(addWorksheetMock).toHaveBeenCalledWith('Lotes');
    expect(lotesSheet.addRow).toHaveBeenCalledWith(
      expect.objectContaining({
        lot_number: '1',
        winner_name: 'Carlos Comprador',
        winner_email: 'carlos@example.com',
        winner_phone: '+5491122334455',
      }),
    );
    expect(writeBufferMock).toHaveBeenCalled();
    expect(downloadedFilename).toBe('historial-remate-de-hacienda.xlsx');

    clickSpy.mockRestore();
  });
});
