import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('asocia el label con el textarea', () => {
    render(<Textarea label="Descripción" />);
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
  });

  it('muestra el mensaje de error y marca aria-invalid', () => {
    render(<Textarea label="Motivo" error="Campo obligatorio" />);
    const textarea = screen.getByLabelText('Motivo');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Campo obligatorio')).toBeInTheDocument();
  });
});
