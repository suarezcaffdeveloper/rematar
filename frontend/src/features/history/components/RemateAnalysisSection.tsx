import type { ReactNode } from 'react';
import { formatCurrency } from '../../../shared/lib/format';
import type { RemateAnalysis } from '../analysis';

export interface RemateAnalysisSectionProps {
  analysis: RemateAnalysis;
  currency: string;
}

function AnalysisCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900" title={typeof children === 'string' ? children : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * "Análisis del remate" -- no es un historial, es el resumen inteligente del desempeño
 * pedido explícitamente. Todo derivado en frontend (`computeRemateAnalysis`,
 * `features/history/analysis.ts`) a partir de datos que el backend ya expone, sin
 * inventar ningún número. "Lote con mayor competencia" y "lote con más ofertas" quedan
 * fusionados en una sola card: el backend solo tiene un dato real para esto
 * (`top_lote_by_offers`). El "incremento total" y la "diferencia obtenida" del pedido
 * original son el mismo número (cuánto se ganó sobre la base) -- una sola card, no dos
 * con el mismo valor.
 */
export function RemateAnalysisSection({ analysis, currency }: RemateAnalysisSectionProps) {
  const diffPositive = analysis.differenceAmount >= 0;
  const diffSign = diffPositive ? '+' : '−';
  const diffAmountText = `${diffSign}${formatCurrency(String(Math.abs(analysis.differenceAmount)), currency)}`;
  const diffPercentageText =
    analysis.differencePercentage != null
      ? `${diffSign}${Math.abs(analysis.differencePercentage).toFixed(1)}%`
      : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Análisis del remate</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <AnalysisCard label="Lotes vendidos">
          {analysis.soldPercentage != null ? `${analysis.soldPercentage.toFixed(0)}%` : '—'}
        </AnalysisCard>
        <AnalysisCard label="Lote con más ofertas (mayor competencia)">
          {analysis.mostContestedLote
            ? `Lote ${analysis.mostContestedLote.lot_number} — ${analysis.mostContestedLote.lote_title} (${analysis.mostContestedLote.offer_count})`
            : '—'}
        </AnalysisCard>
        <AnalysisCard label="Lote sin ofertas">
          {analysis.unsoldWithoutOffersLote
            ? `Lote ${analysis.unsoldWithoutOffersLote.lot_number} — ${analysis.unsoldWithoutOffersLote.title}`
            : 'Ninguno'}
        </AnalysisCard>
        <AnalysisCard label="Valor base total">
          {formatCurrency(String(analysis.totalBasePrice), currency)}
        </AnalysisCard>
        <AnalysisCard label="Valor final adjudicado">
          {formatCurrency(String(analysis.totalAwardedValue), currency)}
        </AnalysisCard>
        <AnalysisCard label="Diferencia obtenida">
          <span className={diffPositive ? 'text-success-600' : 'text-danger-600'}>
            {diffAmountText}
            {diffPercentageText && ` (${diffPercentageText})`}
          </span>
        </AnalysisCard>
      </div>
    </section>
  );
}
