import { Card } from '../../../shared/components/Card';
import { PersonIcon } from '../../remates/components/icons';
import type { PostAuctionCaseDetail } from '../types';

export interface RematadorInfoCardProps {
  data: PostAuctionCaseDetail;
}

/**
 * "Rematador" (sección 5 del pedido) -- por ahora solo el nombre: no hay ningún otro dato
 * público del rematador disponible en el sistema hoy (sin perfil público, ver
 * `PostAuctionCaseRead`). A propósito no trae email/teléfono -- esos campos ni siquiera
 * llegan a esta vista (`PostAuctionCaseRead`, sin los `buyer_email`/`buyer_phone` que sí
 * tiene `PostAuctionCaseRematadorRead` del lado del rematador; acá el equivalente para el
 * rematador ni existe en el DTO).
 */
export function RematadorInfoCard({ data }: RematadorInfoCardProps) {
  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Rematador</h2>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <PersonIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{data.rematador_name ?? '—'}</p>
          <p className="text-xs text-slate-500">Responsable de esta compra</p>
        </div>
      </div>
    </Card>
  );
}
