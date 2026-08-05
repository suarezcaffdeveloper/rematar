import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('muestra el título principal y el link de inicio de sesión', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /la nueva generación de remates en tiempo real/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /iniciar sesión/i }).length).toBeGreaterThan(0);
  });
});
