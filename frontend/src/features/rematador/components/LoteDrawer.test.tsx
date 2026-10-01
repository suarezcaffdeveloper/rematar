import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoteDrawer } from './LoteDrawer';
import type { Lote } from '../../remates/types';

const { apiMocks, toastPushMock } = vi.hoisted(() => ({
  apiMocks: {
    createLoteRequest: vi.fn(),
    updateLoteRequest: vi.fn(),
    updateLoteImagesRequest: vi.fn(),
    uploadLoteImageRequest: vi.fn(),
  },
  toastPushMock: vi.fn(),
}));

vi.mock('../../remates/api', () => apiMocks);
vi.mock('../../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));
// El panel de fotos en edición hace llamadas propias; acá solo importa que se monte.
vi.mock('./LoteGalleryManager', () => ({ LoteGalleryManager: () => <div>Galería del lote</div> }));

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: 'Un toro',
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
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderDrawer(props: Partial<React.ComponentProps<typeof LoteDrawer>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <LoteDrawer isOpen onClose={onClose} remateId="remate-1" currency="ARS" existingLotNumbers={['1', '2', '14']} onSaved={onSaved} {...props} />,
  );
  return { onClose, onSaved, ...utils };
}

async function next() {
  await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
}

async function fillAndReachPrices(title = 'Toro Hereford', base = '1000', inc = '50') {
  await next(); // Fotos -> Datos
  await userEvent.type(screen.getByLabelText(/Nombre/), title);
  await userEvent.selectOptions(screen.getByLabelText(/Categoría/), 'hacienda');
  await next(); // Datos -> Precios
  await userEvent.type(screen.getByLabelText(/Precio inicial/), base);
  await userEvent.type(screen.getByLabelText(/Incremento mínimo/), inc);
}

describe('LoteDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('en creación arranca en Fotos y sugiere el siguiente número de lote', async () => {
    renderDrawer();

    expect(screen.getByRole('dialog', { name: 'Nuevo lote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fotos/ })).toHaveAttribute('aria-current', 'step');
    await next();
    expect(screen.getByLabelText(/Número de lote/)).toHaveValue('15');
  });

  it('no deja avanzar del paso de datos sin nombre ni categoría, y marca los errores', async () => {
    renderDrawer();
    await next();
    await userEvent.clear(screen.getByLabelText(/Número de lote/));
    await userEvent.type(screen.getByLabelText(/Número de lote/), '20');
    await next();

    expect(screen.getByText('El nombre debe tener entre 3 y 200 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Datos/ })).toHaveAttribute('aria-current', 'step');
  });

  it('avisa si el número de lote ya existe, antes de enviar nada', async () => {
    renderDrawer();
    await next();
    await userEvent.clear(screen.getByLabelText(/Número de lote/));
    await userEvent.type(screen.getByLabelText(/Número de lote/), '14');
    await next();

    expect(screen.getByText('Ya existe un lote 14. Elegí otro número.')).toBeInTheDocument();
    expect(apiMocks.createLoteRequest).not.toHaveBeenCalled();
  });

  it('la vista previa muestra lo que ve el comprador y se actualiza al escribir, sin la reserva', async () => {
    renderDrawer();
    await next();
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Toro Hereford');

    const preview = screen.getByText('Así lo ven los compradores').closest('aside') as HTMLElement;
    expect(within(preview).getByText('Toro Hereford')).toBeInTheDocument();
    expect(within(preview).getByText('En remate ahora')).toBeInTheDocument();
    expect(within(preview).getByText(/no ve el precio de reserva/)).toBeInTheDocument();
  });

  it('en Precios sugiere el incremento como porcentaje del precio inicial', async () => {
    renderDrawer();
    await next();
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Lote de prueba');
    await userEvent.selectOptions(screen.getByLabelText(/Categoría/), 'hacienda');
    await next();
    await userEvent.type(screen.getByLabelText(/Precio inicial/), '9600000');
    await userEvent.click(screen.getByRole('button', { name: '1% del precio' }));

    expect(screen.getByLabelText(/Incremento mínimo/)).toHaveValue(96000);
  });

  it('"Guardar lote" crea el lote, avisa que se creó correctamente y cierra el panel', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote({ id: 'nuevo', lot_number: '15', title: 'Toro Hereford' }));
    const { onClose, onSaved } = renderDrawer();

    await fillAndReachPrices();
    await userEvent.click(screen.getByRole('button', { name: /Guardar lote/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiMocks.createLoteRequest).toHaveBeenCalledWith(
      'remate-1',
      expect.objectContaining({ lot_number: '15', title: 'Toro Hereford', category: 'hacienda', base_price: '1000', min_increment: '50' }),
    );
    expect(toastPushMock).toHaveBeenCalledWith('success', 'Lote 15 creado correctamente.');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'nuevo' }), true);
  });

  it('"Guardar y cargar otro" deja el panel abierto, en blanco, con un cartel que confirma el lote creado', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote({ id: 'nuevo', lot_number: '15', title: 'Toro Hereford' }));
    const { onClose, onSaved } = renderDrawer();

    await fillAndReachPrices();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y cargar otro' }));

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Lote 15 creado correctamente.');
    expect(banner).toHaveTextContent('Toro Hereford');
    expect(toastPushMock).toHaveBeenCalledWith('success', 'Lote 15 creado correctamente.');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'nuevo' }), true);
    expect(onClose).not.toHaveBeenCalled();

    // Vuelve al primer paso con el formulario limpio y el número siguiente ya sugerido.
    expect(screen.getByRole('button', { name: /Fotos/ })).toHaveAttribute('aria-current', 'step');
    await next();
    expect(screen.getByLabelText(/Nombre/)).toHaveValue('');
    expect(screen.getByLabelText(/Número de lote/)).toHaveValue('16');
  });

  it('el cartel de lote creado se puede cerrar', async () => {
    apiMocks.createLoteRequest.mockResolvedValue(makeLote({ lot_number: '15' }));
    renderDrawer();

    await fillAndReachPrices();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y cargar otro' }));
    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('un error del backend se muestra dentro del panel y no hay cartel de creado', async () => {
    apiMocks.createLoteRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'business_rule', message: 'No se pudo crear el lote.' } } },
    });
    renderDrawer();

    await fillAndReachPrices();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y cargar otro' }));

    expect(await screen.findByText('No se pudo crear el lote.')).toBeInTheDocument();
    expect(screen.queryByText(/creado correctamente/)).not.toBeInTheDocument();
    expect(toastPushMock).not.toHaveBeenCalledWith('success', expect.anything());
  });

  it('cerrar con cambios sin guardar pide confirmación antes de descartar', async () => {
    const { onClose } = renderDrawer();
    await next();
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Algo');

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Tenés cambios sin guardar. ¿Querés descartarlos?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cerrar sin cambios cierra directo', async () => {
    const { onClose } = renderDrawer();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('en edición carga los valores del lote, usa la galería en vivo y guarda con "Guardar cambios"', async () => {
    apiMocks.updateLoteRequest.mockResolvedValue(makeLote({ title: 'Toro Angus PO' }));
    const { onClose, onSaved } = renderDrawer({ lote: makeLote() });

    expect(screen.getByRole('dialog', { name: 'Lote 1' })).toBeInTheDocument();
    expect(screen.getByText('Galería del lote')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar y cargar otro/ })).not.toBeInTheDocument();

    await next();
    expect(screen.getByLabelText(/Nombre/)).toHaveValue('Toro Angus');
    // Editar un lote no cuenta su propio número como repetido.
    expect(screen.getByLabelText(/Número de lote/)).toHaveValue('1');
    await next();
    await userEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiMocks.updateLoteRequest).toHaveBeenCalledWith('remate-1', 'lote-1', expect.objectContaining({ title: 'Toro Angus' }));
    expect(toastPushMock).toHaveBeenCalledWith('success', 'Lote 1 guardado.');
    expect(onSaved).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('en solo lectura no hay pasos ni formulario, pero sí la vista previa', () => {
    renderDrawer({ lote: makeLote(), readOnly: true });

    expect(screen.queryByRole('navigation', { name: 'Pasos del lote' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument();
    expect(screen.getByText('Toro Angus')).toBeInTheDocument();
    expect(screen.getByText('Solo lectura: el remate está en vivo.')).toBeInTheDocument();
  });
});
