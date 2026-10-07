import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Remate } from '../../../remates/types';
import { EquipoTab } from './EquipoTab';

const generateMock = vi.hoisted(() => vi.fn());
vi.mock('../../../remates/api', () => ({
  generateOperatorCodeRequest: generateMock,
  setRemateStreamRequest: vi.fn(),
  clearRemateStreamRequest: vi.fn(),
}));
vi.mock('../PrivateAccessCredentials', () => ({ PrivateAccessCredentials: () => <div>credenciales</div> }));

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return { id: 'remate-123', access_type: 'public', rematador_id: null, stream_video_id: null, ...overrides } as Remate;
}

function setup(remate: Remate, operatorCode: string | null = null) {
  const onOperatorCodeChange = vi.fn();
  render(<EquipoTab remate={remate} operatorCode={operatorCode} onOperatorCodeChange={onOperatorCodeChange} onRemateChange={vi.fn()} />);
  return onOperatorCodeChange;
}

describe('EquipoTab', () => {
  it('muestra primero los datos del martillero y debajo la transmisión', () => {
    setup(makeRemate());
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles[0]).toMatch(/Datos para el martillero/);
    expect(titles[1]).toMatch(/Transmisión en vivo/);
    expect(screen.getByText('Falta generar')).toBeInTheDocument();
    expect(screen.getByText('Sin transmisión')).toBeInTheDocument();
  });

  it('indica que ya está listo cuando hay martillero y transmisión', () => {
    setup(makeRemate({ rematador_id: 'u1', stream_video_id: 'abc' }));
    expect(screen.getByText('Martillero asignado')).toBeInTheDocument();
    expect(screen.getByText('Publicada')).toBeInTheDocument();
  });

  it('genera el código y lo entrega a la Cabina', async () => {
    generateMock.mockResolvedValue({ code: 'ABCD2345' });
    const onChange = setup(makeRemate());
    await userEvent.click(screen.getByRole('button', { name: /Generar código/ }));
    expect(onChange).toHaveBeenCalledWith('ABCD2345');
  });

  it('muestra el código generado y el aviso de que se ve una sola vez', () => {
    setup(makeRemate(), 'ABCD2345');
    expect(screen.getByText('ABCD2345')).toBeInTheDocument();
    expect(screen.getByText(/una sola vez/)).toBeInTheDocument();
    expect(screen.getByText('Código listo')).toBeInTheDocument();
  });

  it('el acceso privado solo aparece en remates privados', () => {
    setup(makeRemate({ access_type: 'private' }));
    expect(screen.getByRole('button', { name: /Acceso privado/ })).toBeInTheDocument();
  });
});
