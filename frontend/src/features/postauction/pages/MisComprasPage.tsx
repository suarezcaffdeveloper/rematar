import { useState } from 'react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../../remates/components/icons';
import { CaseCard } from '../components/CaseCard';
import { useMisCompras } from '../hooks';

const PAGE_SIZE = 12;

/**
 * "Mis compras" del comprador (Épica 7, Módulo 7.5), en `/mis-compras` -- lotes ganados,
 * estado actual, fecha de adjudicación, precio final e información del rematador (pedido
 * explícito del enunciado). El backend (`PostAuctionService.list_for_buyer`) ya
 * restringe a las compras propias.
 */
export function MisComprasPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMisCompras(page, PAGE_SIZE);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Mis compras' }]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mis compras</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lotes que ganaste y el estado de su proceso de pago y entrega.
        </p>
      </div>

      {error ? (
        <Alert variant="error">No se pudieron cargar tus compras.</Alert>
      ) : isLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Todavía no ganaste ningún lote"
          description="Cuando te adjudiquen un lote, vas a poder seguir acá el proceso de pago y entrega."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((item) => (
              <CaseCard key={item.id} item={item} to={`/mis-compras/${item.id}`} perspective="comprador" />
            ))}
          </div>

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">
                {data.total} {data.total === 1 ? 'compra' : 'compras'} · página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
