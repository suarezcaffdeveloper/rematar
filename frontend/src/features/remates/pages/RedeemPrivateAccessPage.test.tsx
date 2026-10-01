import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLayoutPreferencesStore } from '../../../app/layouts/layoutPreferencesStore';
import { RedeemPrivateAccessPage } from './RedeemPrivateAccessPage';
import type { Remate } from '../types';

const { navigateMock, apiMocks } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  apiMocks: {
    redeemPrivateAccessRequest: vi.fn(),
    fetchMyPrivateAccessGrantsRequest: vi.fn(),
    // Las fichas de "Tus remates privados" dependen de estos dos vía `useLoteCount`/
    // `useLoteCoverImages` (`../hooks`) -- sin mockearlos acá también,
    // `vi.mock('../api', ...)` los deja `undefined` y esos hooks explotan.
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
const VALID_URL = `https://rematar.test/remates/${VALID_UUID}`;

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

async function fillForm(url: string, code: string) {
  await userEvent.type(screen.getByLabelText('URL del remate'), url);
  await userEvent.type(screen.getByLabelText('Código de acceso'), code);
}

describe('RedeemPrivateAccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchMyPrivateAccessGrantsRequest.mockResolvedValue([]);
    apiMocks.fetchLoteCountRequest.mockResolvedValue(0);
    apiMocks.fetchLotesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1 });
  });

  afterEach(() => {
    act(() => {
      useLayoutPreferencesStore.setState({ isTopNav: false });
    });
  });

  it('canjear una URL y código válidos confirma el acceso y "Ir al remate" navega a su detalle', async () => {
    apiMocks.redeemPrivateAccessRequest.mockResolvedValue({ id: VALID_UUID, title: 'Remate X' });

    renderPage();
    await fillForm(VALID_URL, 'a3k7p2qxht');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(apiMocks.redeemPrivateAccessRequest).toHaveBeenCalledWith(VALID_UUID, 'A3K7P2QXHT');
    expect(await screen.findByRole('heading', { name: 'Acceso concedido' })).toBeInTheDocument();
    expect(screen.getByText('Entrando a Remate X.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ir al remate' }));
    expect(navigateMock).toHaveBeenCalledWith(`/remates/${VALID_UUID}`);
  });

  it('tras la confirmación, entra solo al remate sin tocar nada', async () => {
    apiMocks.redeemPrivateAccessRequest.mockResolvedValue({ id: VALID_UUID, title: 'Remate X' });

    renderPage();
    await fillForm(VALID_URL, 'A3K7P2QXHT');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));
    await screen.findByRole('heading', { name: 'Acceso concedido' });

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(`/remates/${VALID_UUID}`), { timeout: 3000 });
  });

  it('extrae el id aunque la URL pegada tenga /sala u otros segmentos al final', async () => {
    apiMocks.redeemPrivateAccessRequest.mockResolvedValue({ id: VALID_UUID, title: 'Remate X' });

    renderPage();
    await fillForm(`${VALID_URL}/sala`, 'A3K7P2QXHT');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(apiMocks.redeemPrivateAccessRequest).toHaveBeenCalledWith(VALID_UUID, 'A3K7P2QXHT');
  });

  it('al pegar una URL válida avisa "Remate detectado", habilita el código y le pasa el foco', async () => {
    renderPage();
    const code = screen.getByLabelText('Código de acceso');
    expect(code).toBeDisabled();

    await userEvent.click(screen.getByLabelText('URL del remate'));
    await userEvent.paste(VALID_URL);

    expect(screen.getByText('Remate detectado')).toBeInTheDocument();
    expect(code).toBeEnabled();
    expect(code).toHaveFocus();
  });

  it('tipeando la URL a mano, el foco no salta al código a mitad de camino', async () => {
    renderPage();
    const url = screen.getByLabelText('URL del remate');

    await userEvent.type(url, `${VALID_URL}/sala`);

    expect(url).toHaveValue(`${VALID_URL}/sala`);
    expect(url).toHaveFocus();
    expect(screen.getByLabelText('Código de acceso')).toBeEnabled();
  });

  it('una URL que no matchea el patrón muestra el error, deja el código deshabilitado y no llama al backend', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('URL del remate'), 'https://rematar.test/no-es-un-remate');
    await userEvent.tab();

    expect(screen.getByText('Pegá la URL completa que te compartió la empresa.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código de acceso')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Entrar al remate' })).toBeDisabled();
    expect(apiMocks.redeemPrivateAccessRequest).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('el botón queda deshabilitado hasta completar la URL y el código', async () => {
    renderPage();
    const submit = screen.getByRole('button', { name: 'Entrar al remate' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('URL del remate'), VALID_URL);
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Código de acceso'), 'A3K7P2QXHT');
    expect(submit).toBeEnabled();
  });

  it('un código o URL inválidos según el backend muestran un error genérico, sin navegar', async () => {
    apiMocks.redeemPrivateAccessRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'not_found', message: 'Remate no encontrado o código inválido.' } } },
    });

    renderPage();
    await fillForm(VALID_URL, 'BADCODE123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al remate' }));

    expect(await screen.findByText('URL o código inválido.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acceso concedido' })).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('explica los tres pasos para conseguir el acceso', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Cómo conseguir el acceso' })).toBeInTheDocument();
    expect(screen.getByText('La empresa organiza un remate privado')).toBeInTheDocument();
    expect(screen.getByText('Entrás al remate')).toBeInTheDocument();
  });

  it('sin remates ya canjeados, no muestra la sección "Tus remates privados"', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Ingresar a remate privado' });
    expect(screen.queryByText('Tus remates privados')).not.toBeInTheDocument();
  });

  it('con remates ya canjeados, los muestra abajo del formulario para reingresar sin código', async () => {
    apiMocks.fetchMyPrivateAccessGrantsRequest.mockResolvedValue([GRANTED_REMATE]);

    renderPage();

    expect(await screen.findByText('Tus remates privados')).toBeInTheDocument();
    const tile = screen.getByRole('link', { name: /Remate privado de hacienda/ });
    expect(tile).toHaveAttribute('href', '/remates/remate-granted-1');
    expect(within(tile).getByText('En vivo')).toBeInTheDocument();
  });

  it('le pide a AppLayout la barra superior mientras está montada y la suelta al salir', () => {
    const { unmount } = renderPage();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(true);

    unmount();
    expect(useLayoutPreferencesStore.getState().isTopNav).toBe(false);
  });
});
