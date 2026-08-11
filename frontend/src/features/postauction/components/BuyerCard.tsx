import { Card } from '../../../shared/components/Card';
import { MailIcon, PersonIcon, PhoneIcon } from '../../remates/components/icons';
import type { PostAuctionCaseDetail } from '../types';

export interface BuyerCardProps {
  data: PostAuctionCaseDetail;
}

/** `phone` se guarda ya normalizado (dígitos + `+` opcional, ver `modules/users/models.py`)
 * -- para wa.me alcanza con sacar cualquier caracter que no sea dígito. */
function whatsAppLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
}

/**
 * "Comprador" (pedido explícito, sección 4) -- `buyer_email`/`buyer_phone` ya llegan en
 * `PostAuctionCaseRematadorDetail` (el backend los expone solo en el lado rematador,
 * nunca en `/postauction/mis-compras`), simplemente no se mostraban antes acá. Los links
 * de contacto son `mailto:`/`wa.me` reales (abren el cliente del usuario), no una
 * integración simulada -- no requieren backend nuevo.
 */
export function BuyerCard({ data }: BuyerCardProps) {
  const hasContactActions = Boolean(data.buyer_email || data.buyer_phone);

  return (
    <Card>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <PersonIcon className="h-4 w-4 text-slate-400" />
        Comprador
      </h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nombre</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{data.buyer_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
          <dd className="mt-0.5 text-slate-700">{data.buyer_email ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teléfono</dt>
          <dd className="mt-0.5 text-slate-700">{data.buyer_phone ?? '—'}</dd>
        </div>
      </dl>

      {hasContactActions && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {data.buyer_email && (
            <a
              href={`mailto:${data.buyer_email}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50"
            >
              <MailIcon className="h-3.5 w-3.5" />
              Enviar email
            </a>
          )}
          {data.buyer_phone && (
            <a
              href={whatsAppLink(data.buyer_phone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50"
            >
              <PhoneIcon className="h-3.5 w-3.5" />
              Contactar por WhatsApp
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
