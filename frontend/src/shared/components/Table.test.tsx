import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table';

function renderSample() {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Juan</TableCell>
          <TableCell>Conectado</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table', () => {
  it('renderiza una tabla nativa con encabezados y filas', () => {
    renderSample();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Juan' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Conectado' })).toBeInTheDocument();
  });
});
