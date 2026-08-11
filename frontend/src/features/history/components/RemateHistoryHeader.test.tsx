import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemateHistoryHeader } from './RemateHistoryHeader';
import type { Remate } from '../../remates/types';

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

describe('RemateHistoryHeader', () => {
  it('muestra título, estado, categoría y ubicación', () => {
    render(<RemateHistoryHeader remate={makeRemate()} />);

    expect(screen.getByRole('heading', { name: 'Remate de hacienda' })).toBeInTheDocument();
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
    expect(screen.getByText('Hacienda')).toBeInTheDocument();
    expect(screen.getByText('Rosario, Santa Fe')).toBeInTheDocument();
  });

  it('"Compartir" sigue siendo un placeholder deshabilitado', () => {
    render(<RemateHistoryHeader remate={makeRemate()} />);
    expect(screen.getByRole('button', { name: /Compartir/ })).toBeDisabled();
  });

  it('sin isExportDisabled, PDF/Excel están habilitados y disparan sus callbacks', async () => {
    const onExportPdf = vi.fn();
    const onExportExcel = vi.fn();
    render(<RemateHistoryHeader remate={makeRemate()} onExportPdf={onExportPdf} onExportExcel={onExportExcel} />);

    const pdfButton = screen.getByRole('button', { name: /Exportar PDF/ });
    const excelButton = screen.getByRole('button', { name: /Exportar Excel/ });
    expect(pdfButton).not.toBeDisabled();
    expect(excelButton).not.toBeDisabled();

    await userEvent.click(pdfButton);
    await userEvent.click(excelButton);
    expect(onExportPdf).toHaveBeenCalledTimes(1);
    expect(onExportExcel).toHaveBeenCalledTimes(1);
  });

  it('con isExportDisabled, PDF/Excel quedan deshabilitados', () => {
    render(<RemateHistoryHeader remate={makeRemate()} isExportDisabled />);

    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Exportar Excel/ })).toBeDisabled();
  });

  it('sin ubicación, no muestra esa fila', () => {
    render(<RemateHistoryHeader remate={makeRemate({ location: null })} />);
    expect(screen.queryByText('Rosario, Santa Fe')).not.toBeInTheDocument();
  });
});
