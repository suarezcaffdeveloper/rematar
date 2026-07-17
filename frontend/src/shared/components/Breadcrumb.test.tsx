import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb';

describe('Breadcrumb', () => {
  it('renderiza cada paso intermedio como link y el último como texto plano', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Remate de prueba' }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toHaveAttribute('href', '/');

    const current = screen.getByText('Remate de prueba');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Remate de prueba' })).not.toBeInTheDocument();
  });

  it('un único paso se renderiza sin separador ni link', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'Dashboard' }]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
