import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteGalleryManager } from './LoteGalleryManager';
import type { Lote } from '../../remates/types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: {
    uploadLoteImageRequest: vi.fn(),
    updateLoteImagesRequest: vi.fn(),
  },
  toastPushMock: vi.fn(),
}));

vi.mock('../../remates/api', () => apiMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
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
    final_price: null,
    status: 'pending',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeFile(name: string, type: string): File {
  return new File(['contenido'], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = vi.fn();
});

describe('LoteGalleryManager', () => {
  it('sin imágenes, muestra el placeholder', () => {
    render(<LoteGalleryManager remateId="remate-1" lote={makeLote()} onChanged={vi.fn()} />);
    expect(screen.getByText('Arrastrá imágenes acá o hacé clic para elegirlas')).toBeInTheDocument();
  });

  it('con imágenes, muestra la principal y las miniaturas ordenadas', () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
      ],
    });
    render(<LoteGalleryManager remateId="remate-1" lote={lote} onChanged={vi.fn()} />);

    expect(screen.getByAltText('Imagen principal del lote')).toHaveAttribute(
      'src',
      'https://example.com/a.jpg',
    );
    expect(screen.getByRole('button', { name: 'Marcar imagen 1 como principal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sube un archivo válido y persiste el array de imágenes con la URL nueva', async () => {
    const onChanged = vi.fn();
    apiMocks.uploadLoteImageRequest.mockResolvedValue({ url: 'https://example.com/nueva.jpg' });
    apiMocks.updateLoteImagesRequest.mockResolvedValue(makeLote({ images: [{ url: 'https://example.com/nueva.jpg', order: 0, caption: null }] }));

    render(<LoteGalleryManager remateId="remate-1" lote={makeLote()} onChanged={onChanged} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile('foto.jpg', 'image/jpeg'));

    await waitFor(() => expect(apiMocks.updateLoteImagesRequest).toHaveBeenCalled());
    expect(apiMocks.updateLoteImagesRequest).toHaveBeenCalledWith('remate-1', 'lote-1', [
      { url: 'https://example.com/nueva.jpg', order: 0, caption: null },
    ]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('rechaza un archivo con formato inválido sin llamar a la API', async () => {
    render(<LoteGalleryManager remateId="remate-1" lote={makeLote()} onChanged={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // `applyAccept: false` -- el navegador real igual permite elegir "todos los
    // archivos" en el diálogo nativo pese al atributo `accept`, así que la validación
    // de formato tiene que ser explícita en `validateImageFile`, no delegada al input.
    await userEvent.upload(input, makeFile('doc.txt', 'text/plain'), { applyAccept: false });

    expect(apiMocks.uploadLoteImageRequest).not.toHaveBeenCalled();
    expect(toastPushMock).toHaveBeenCalledWith('error', expect.stringMatching(/formato/i));
  });

  it('marcar una miniatura como principal reordena y persiste', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    apiMocks.updateLoteImagesRequest.mockResolvedValue(lote);

    render(<LoteGalleryManager remateId="remate-1" lote={lote} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar imagen 2 como principal' }));

    await waitFor(() =>
      expect(apiMocks.updateLoteImagesRequest).toHaveBeenCalledWith('remate-1', 'lote-1', [
        { url: 'https://example.com/b.jpg', order: 0, caption: null },
        { url: 'https://example.com/a.jpg', order: 1, caption: null },
      ]),
    );
  });

  it('eliminar una imagen pide confirmación y persiste el array sin ella', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    apiMocks.updateLoteImagesRequest.mockResolvedValue(lote);

    render(<LoteGalleryManager remateId="remate-1" lote={lote} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar imagen 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() =>
      expect(apiMocks.updateLoteImagesRequest).toHaveBeenCalledWith('remate-1', 'lote-1', [
        { url: 'https://example.com/b.jpg', order: 0, caption: null },
      ]),
    );
  });

  it('mover una imagen con las flechas reordena y persiste', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    apiMocks.updateLoteImagesRequest.mockResolvedValue(lote);

    render(<LoteGalleryManager remateId="remate-1" lote={lote} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mover imagen 1 hacia la derecha' }));

    await waitFor(() =>
      expect(apiMocks.updateLoteImagesRequest).toHaveBeenCalledWith('remate-1', 'lote-1', [
        { url: 'https://example.com/b.jpg', order: 0, caption: null },
        { url: 'https://example.com/a.jpg', order: 1, caption: null },
      ]),
    );
  });

  it('si falla la persistencia, revierte el orden y avisa por toast', async () => {
    const lote = makeLote({
      images: [
        { url: 'https://example.com/a.jpg', order: 0, caption: null },
        { url: 'https://example.com/b.jpg', order: 1, caption: null },
      ],
    });
    apiMocks.updateLoteImagesRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo guardar.' } } },
    });

    render(<LoteGalleryManager remateId="remate-1" lote={lote} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar imagen 2 como principal' }));

    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', 'No se pudo guardar.'));
    expect(screen.getByAltText('Imagen principal del lote')).toHaveAttribute(
      'src',
      'https://example.com/a.jpg',
    );
  });
});
