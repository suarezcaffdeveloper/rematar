import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressStepper } from './ProgressStepper';

describe('ProgressStepper', () => {
  it('muestra los 8 estados del flujo', () => {
    render(<ProgressStepper status="adjudicado" />);

    expect(screen.getByText('Adjudicado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de contacto')).toBeInTheDocument();
    expect(screen.getByText('Pago pendiente')).toBeInTheDocument();
    expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    expect(screen.getByText('Preparando entrega')).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getByText('Entregado')).toBeInTheDocument();
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
  });

  it('marca el estado actual con aria-current', () => {
    render(<ProgressStepper status="pago_recibido" />);
    const current = screen.getByText('4', { selector: 'span[aria-current="step"]' });
    expect(current).toBeInTheDocument();
  });

  it('marca los estados anteriores como completados (✓)', () => {
    render(<ProgressStepper status="pago_recibido" />);
    const checks = screen.getAllByText('✓');
    // adjudicado, pendiente_contacto, pago_pendiente -- los tres anteriores a pago_recibido
    expect(checks).toHaveLength(3);
  });
});
