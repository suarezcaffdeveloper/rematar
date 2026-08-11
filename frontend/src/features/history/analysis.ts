/**
 * Cálculos puros del bloque "Análisis del remate" del informe ejecutivo
 * (`RemateAnalysisSection`, `RemateHistoryDetailPage`) -- separados del JSX para poder
 * testearlos con fixtures simples, sin montar componentes. Todo derivado en frontend a
 * partir de datos que el backend ya expone (`RemateHistoryDetail`/`Lote[]`), sin inventar
 * ningún número: donde falta el dato real, se devuelve `null` y el componente muestra un
 * placeholder explícito.
 */

import type { TopLoteByOffers } from '../analytics/types';
import type { Lote } from '../remates/types';
import type { LoteResultsMap } from './hooks';
import type { RemateHistoryDetail } from './types';

export interface RemateAnalysis {
  /** 0-100, `null` si el remate no tenía lotes. */
  soldPercentage: number | null;
  /** Lote con más ofertas -- funciona a la vez como "lote con mayor competencia", el
   * backend no distingue esos dos conceptos (`top_lote_by_offers`). */
  mostContestedLote: TopLoteByOffers | null;
  /** Primer lote desierto (`closed_unsold`) confirmado con cero ofertas -- `null` si no
   * hay ninguno, o si no se pudo confirmar el conteo de ofertas de ningún lote desierto. */
  unsoldWithoutOffersLote: Lote | null;
  /** Suma de `base_price` de los lotes efectivamente vendidos -- el remate puede no
   * tener ningún lote vendido, en cuyo caso es `0` y `differencePercentage` queda `null`. */
  totalBasePrice: number;
  totalAwardedValue: number;
  differenceAmount: number;
  /** `null` cuando `totalBasePrice` es 0 (nada que vender, o nada vendido) -- evita una
   * división por cero en vez de mostrar `Infinity`/`NaN`. */
  differencePercentage: number | null;
}

export function computeRemateAnalysis(
  detail: RemateHistoryDetail,
  lotes: Lote[],
  offerCounts: LoteResultsMap,
): RemateAnalysis {
  const { total, closed_sold: closedSold } = detail.lote_status_counts;
  const soldPercentage = total > 0 ? (closedSold / total) * 100 : null;

  const soldLotes = lotes.filter((lote) => lote.final_price != null);
  const totalBasePrice = soldLotes.reduce((sum, lote) => sum + Number(lote.base_price), 0);
  const totalAwardedValue = Number(detail.total_awarded_value);
  const differenceAmount = totalAwardedValue - totalBasePrice;
  const differencePercentage = totalBasePrice > 0 ? (differenceAmount / totalBasePrice) * 100 : null;

  const unsoldWithoutOffersLote =
    lotes.find((lote) => lote.status === 'closed_unsold' && offerCounts.get(lote.id)?.offer_count === 0) ?? null;

  return {
    soldPercentage,
    mostContestedLote: detail.top_lote_by_offers,
    unsoldWithoutOffersLote,
    totalBasePrice,
    totalAwardedValue,
    differenceAmount,
    differencePercentage,
  };
}
