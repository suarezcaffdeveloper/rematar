import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RedeemPrivateAccessPage } from './RedeemPrivateAccessPage';
import type { Remate } from '../types';

const { navigateMock, apiMocks } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  apiMocks: {
    redeemPrivateAccessRequest: vi.fn(),
    fetchMyPrivateAccessGrantsRequest: vi.fn(),
    // `RemateCard`, reusado para las cards de "Tus remates privados", depende de estos
    // dos vía `useLoteCount`/`useLoteCoverImages` (`../hooks`) -- sin mockearlos acá
    // también, `vi.mock('../api', ...)` los deja `undefined` y esos hooks explotan.
    fetchLoteCountRequest: vi.fn(),
    fetchLotesRequest: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../api', () => apiMocks);

function renderPage() {
  return render(
    <MemoryRouter>
      <RedeemPrivateAccessPage />
    </MemoryRouter>,
  );
}

const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const GRANTED_REMATE: Remate = {
  id: 'remate-granted-1',
  owner_id: 'owner-1',
  title: 'Remate privado de hacienda',
  description: null,
  category: 'hacienda',
  cover_image_url: null,
  location: null,
  starts_at: null,
  ends_at: null,
  status: 'live',
  settings: {
    anti_sniping_enabled: false,
    anti_sniping_extension_seconds: 60,
    currency: 'ARS',
    lote_timer_seconds: null,
  },
  cancellation_reason: null,
  cancelled_at: null,
  finished_at: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

describe('RedeemPrivateAccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchMyPrivateAccessGrantsRequest.mockResolvedValue([]);
    apiMocks.fetchLoteCountRequest.mockResolvedValue(0);
    apiMocks.fetchLotesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1 });
  });

  it('canjear una URL y código válidos navega al detalle de ese remate', async () => {
    apiMocks.redeemPrivateAccessRequest.mockResolvedValue({ id: VALID_UUID });

    renderPage();
    await userEvent.type(
      screen.getByLabelText('URL del remate'),
      `https://rematar.test/remates/${VALID_UUID}`,
    );
    await userEvent.type(screen.getByLabelText('Código de acceso'), 'a3k7p2qxht');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(apiMocks.redeemPrivateAccessRequest).toHaveBeenCalledWith(VALID_UUID, 'A3K7P2QXHT');
    expect(navigateMock).toHaveBeenCalledWith(`/remates/${VALID_UUID}`);
  });

  it('extrae el id aunque la URL pegada tenga /sala u otros segmentos al final', async () => {
    apiMocks.redeemPrivateAccessRequest.mockResolvedValue({ id: VALID_UUID });

    renderPage();
    await userEvent.type(
      screen.getByLabelText('URL del remate'),
      `https://rematar.test/remates/${VALID_UUID}/sala`,
    );
    await userEvent.type(screen.getByLabelText('Código de acceso'), 'A3K7P2QXHT');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(apiMocks.redeemPrivateAccessRequest).toHaveBeenCalledWith(VALID_UUID, 'A3K7P2QXHT');
  });

  it('una URL que no matchea el patrón de remate muestra un error sin llamar al backend', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('URL del remate'), 'https://rematar.test/no-es-un-remate');
    await userEvent.type(screen.getByLabelText('Código de acceso'), 'A3K7P2QXHT');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(await screen.findByText('Pegá la URL completa que te compartió la empresa.')).toBeInTheDocument();
    expect(apiMocks.redeemPrivateAccessRequest).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('un código o URL inválidos según el backend muestran un error genérico, sin navegar', async () => {
    apiMocks.redeemPrivateAccessRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'not_found', message: 'Remate no encontrado o código inválido.' } } },
    });

    renderPage();
    await userEvent.type(
      screen.getByLabelText('URL del remate'),
      `https://rematar.test/remates/${VALID_UUID}`,
    );
    await userEvent.type(screen.getByLabelText('Código de acceso'), 'BADCODE123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(await screen.findByText('URL o código inválido.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('sin remates ya canjeados, no muestra la sección "Tus remates privados"', async () => {
    renderPage();

    await screen.findByText('Ingresar a remate privado');
    expect(screen.queryByText('Tus remates privados')).not.toBeInTheDocument();
  });

  it('con remates ya canjeados, los muestra abajo del formulario para reingresar sin código', async () => {
    apiMocks.fetchMyPrivateAccessGrantsRequest.mockResolvedValue([GRANTED_REMATE]);

    renderPage();

    expect(await screen.findByText('Tus remates privados')).toBeInTheDocument();
    expect(screen.getByText('Remate privado de hacienda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver remate' })).toBeInTheDocument();
  });
});
