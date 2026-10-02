import { useState } from 'react';
import { Check, Copy, Mail, MessageCircle, Phone } from 'lucide-react';
import { useToastStore } from '../../../shared/toast/toastStore';
import type { PostAuctionCaseDetail } from '../types';

export interface BuyerCardProps {
  data: PostAuctionCaseDetail;
}

/** `phone` se guarda ya normalizado (dígitos + `+` opcional, ver `modules/users/models.py`)
 * -- para wa.me alcanza con sacar cualquier caracter que no sea dígito. */
function whatsAppLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Algunos navegadores/vistas bloquean el portapapeles: se muestra el dato para copiarlo a mano.
      useToastStore.getState().push('info', value);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={`Copiar ${label}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-600" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * "Comprador": nombre y datos de contacto, con copiar. `buyer_email`/`buyer_phone` solo
 * llegan en la respuesta que ve la empresa dueña (`PostAuctionCaseRematadorDetail`, nunca en
 * `/postauction/mis-compras`). Los links son `mailto:`/`wa.me` reales (abren el cliente del
 * usuario): no dejan ningún registro en el caso, y la tarjeta lo dice -- para que quede
 * asentado hay que cambiar el estado o escribir una observación.
 */
export function BuyerCard({ data }: BuyerCardProps) {
  return (
    <section aria-labelledby="buyer-title" className="rounded-3xl border border-line bg-white p-5">
      <h2 id="buyer-title" className="mb-3 text-xs font-bold text-ink-muted">
        Comprador
      </h2>
      <p className="mb-3 text-xl font-semibold tracking-tight">{data.buyer_name ?? '—'}</p>

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center gap-2">
          <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" />
          {data.buyer_email ? (
            <>
              <a href={`mailto:${data.buyer_email}`} className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline">
                {data.buyer_email}
              </a>
              <CopyButton value={data.buyer_email} label="email" />
            </>
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" />
          {data.buyer_phone ? (
            <>
              <span className="min-w-0 flex-1 truncate">{data.buyer_phone}</span>
              <CopyButton value={data.buyer_phone} label="teléfono" />
            </>
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </div>
      </div>

      {(data.buyer_email || data.buyer_phone) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.buyer_email && (
            <a
              href={`mailto:${data.buyer_email}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Mail aria-hidden="true" className="h-3.5 w-3.5" />
              Enviar email
            </a>
          )}
          {data.buyer_phone && (
            <a
              href={whatsAppLink(data.buyer_phone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
              Contactar por WhatsApp
            </a>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-ink-muted">
        Estos contactos no dejan registro en la venta. Cuando hables con el comprador, anotalo en una observación o al cambiar el estado.
      </p>
    </section>
  );
}
