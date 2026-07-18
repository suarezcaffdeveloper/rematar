import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from './Select';

describe('Select', () => {
  it('asocia el label con el select y renderiza las opciones', () => {
    render(
      <Select label="Categoría" defaultValue="hacienda">
        <option value="hacienda">Hacienda</option>
        <option value="vehiculos">Vehículos</option>
      </Select>,
    );
    const select = screen.getByLabelText('Categoría');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hacienda' })).toBeInTheDocument();
  });

  it('muestra el mensaje de error y marca aria-invalid', () => {
    render(
      <Select label="Categoría" error="Elegí una categoría">
        <option value="">Elegir…</option>
      </Select>,
    );
    expect(screen.getByLabelText('Categoría')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Elegí una categoría')).toBeInTheDocument();
  });
});
