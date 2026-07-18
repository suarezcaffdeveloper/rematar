import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GestionRematePlaceholderPage } from './GestionRematePlaceholderPage';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPlaceholder(remateId = 'remate-1') {
  return render(
    <MemoryRouter initialEntries={[`/remates/${remateId}/gestionar`]}>
      <Routes>
        <Route path="/remates/:remateId/gestionar" element={<GestionRematePlaceholderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GestionRematePlaceholderPage', () => {
  it('muestra el mensaje de "en construcción" y un botón para volver a la ficha del remate', async () => {
    renderPlaceholder('remate-9');

    expect(screen.getByText('Consola operativa en construcción')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver ficha del remate' }));
    expect(navigateMock).toHaveBeenCalledWith('/remates/remate-9');
  });
});
