import { Card } from '../../../shared/components/Card';
import { PersonIcon } from '../../remates/components/icons';
import type { PostAuctionCaseDetail } from '../types';

export interface RematadorInfoCardProps {
  data: PostAuctionCaseDetail;
}

/**
 * "Responsables de esta compra" (sección 5 del pedido) -- por ahora solo el nombre: no hay
 * ningún otro dato público del rematador disponible en el sistema hoy (sin perfil público,
 * ver `PostAuctionCaseRead`). A propósito no trae email/teléfono -- esos campos ni siquiera
 * llegan a esta vista (`PostAuctionCaseRead`, sin los `buyer_email`/`buyer_phone` que sí
 * tiene `PostAuctionCaseRematadorRead` del lado del rematador; acá el equivalente para el
 * rematador ni existe en el DTO).
 *
 * Muestra el rematador que efectivamente operó el remate en vivo (`operador_name`) y,
 * por separado, la empresa creadora del remate (`empresa_name`) -- antes esta card
 * mostraba la empresa bajo el rótulo "rematador" (ver comentario en
 * `postauction/types.ts`). Si la empresa operó el remate ella misma sin asignar a un
 * rematador (`operador_name` vacío), son la misma persona -- se muestra una sola fila
 * para no repetir el mismo nombre dos veces.
 */
export function RematadorInfoCard({ data }: RematadorInfoCardProps) {
  const rematadorName = data.operador_name ?? data.empresa_name ?? data.rematador_name;
  const showEmpresaRow = Boolean(data.operador_name) && data.empresa_name !== data.operador_name;

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Responsables de esta compra</h2>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <PersonIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{rematadorName ?? '—'}</p>
            <p className="text-xs text-slate-500">Martillero responsable de la gestión del remate</p>
          </div>
        </div>

        {showEmpresaRow && (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <PersonIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{data.empresa_name}</p>
              <p className="text-xs text-slate-500">Empresa creadora y dueña del remate</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
