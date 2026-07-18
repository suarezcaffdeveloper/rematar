import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RemateCard } from './RemateCard';
import type { Remate } from '../types';

const { navigateMock, useLoteCountMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLoteCountMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../hooks', () => ({ useLoteCount: useLoteCountMock }));

const REMATE: Remate = {
  id: 'remate-1',
  owner_id: 'owner-1',
  title: 'Remate de maquinaria agrícola',
  description: null,
  category: 'maquinaria_agricola',
  cover_image_url: null,
  location: 'Rosario, Santa Fe',
  starts_at: '2026-08-01T14:30:00Z',
  ends_at: null,
  status: 'scheduled',
  settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
  cancellation_reason: null,
  cancelled_at: null,
  finished_at: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

function renderCard(remate: Remate = REMATE) {
  return render(
    <MemoryRouter>
      <RemateCard remate={remate} />
    </MemoryRouter>,
  );
}

describe('RemateCard', () => {
  it('muestra título, categoría, estado, ubicación y lote count', () => {
    useLoteCountMock.mockReturnValue(3);

    renderCard();

    expect(screen.getByText('Remate de maquinaria agrícola')).toBeInTheDocument();
    expect(screen.getByText('Maquinaria agrícola')).toBeInTheDocument();
    expect(screen.getByText('Programado')).toBeInTheDocument();
    expect(screen.getByText('Rosario, Santa Fe')).toBeInTheDocument();
    expect(screen.getByText('3 lotes')).toBeInTheDocument();
  });

  it('mientras el lote count carga, no afirma una cantidad que no confirmó', () => {
    useLoteCountMock.mockReturnValue(null);

    renderCard();

    expect(screen.getByText('Cargando lotes…')).toBeInTheDocument();
  });

  it('sin cover_image_url, no intenta renderizar un <img> roto', () => {
    useLoteCountMock.mockReturnValue(0);

    renderCard();

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('al hacer click en "Ver remate", navega al detalle de ESE remate', async () => {
    useLoteCountMock.mockReturnValue(1);

    renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Ver remate' }));

    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-1');
  });
});
