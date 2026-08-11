import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemateAnalysisSection } from './RemateAnalysisSection';
import type { RemateAnalysis } from '../analysis';

function makeAnalysis(overrides: Partial<RemateAnalysis> = {}): RemateAnalysis {
  return {
    soldPercentage: 66.67,
    mostContestedLote: { lote_id: 'lote-2', lot_number: '2', lote_title: 'Vaquillona', offer_count: 4 },
    unsoldWithoutOffersLote: null,
    totalBasePrice: 1800,
    totalAwardedValue: 2200,
    differenceAmount: 400,
    differencePercentage: 22.22,
    ...overrides,
  };
}

describe('RemateAnalysisSection', () => {
  it('muestra los indicadores derivados con signo cuando la diferencia es positiva', () => {
    render(<RemateAnalysisSection analysis={makeAnalysis()} currency="ARS" />);

    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText(/Lote 2 — Vaquillona \(4\)/)).toBeInTheDocument();
    expect(screen.getByText('Ninguno')).toBeInTheDocument();
    expect(screen.getByText(/\+.*22\.2%/)).toBeInTheDocument();
  });

  it('con diferencia negativa, muestra el signo "−" en vez de "+"', () => {
    render(
      <RemateAnalysisSection
        analysis={makeAnalysis({ differenceAmount: -300, differencePercentage: -15 })}
        currency="ARS"
      />,
    );

    expect(screen.getByText(/−.*15\.0%/)).toBeInTheDocument();
  });

  it('sin datos de análisis, muestra placeholders sin romper', () => {
    render(
      <RemateAnalysisSection
        analysis={makeAnalysis({ soldPercentage: null, mostContestedLote: null, differencePercentage: null })}
        currency="ARS"
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
