import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { Input } from '../../../shared/components/Input';
import { redeemPrivateAccessRequest } from '../api';
import { RemateCard } from '../components/RemateCard';
import { RemateCardSkeleton } from '../components/RemateCardSkeleton';
import { useMyPrivateAccessGrants } from '../hooks';

const CARD_GRID_CLASSES = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const GRANTS_SKELETON_COUNT = 3;

/** Pasos del canje, mismo formato explicativo que `OperatorClaimPage::CLAIM_STEPS`. */
const REDEEM_STEPS = [
  {
    title: 'La empresa organiza un remate privado',
    description: 'Y te comparte la URL del remate junto con un código de acceso.',
  },
  {
    title: 'Ingresás los datos acá',
    description: 'Pegá la URL completa y el código en el formulario para canjearlo.',
  },
  {
    title: 'Entrás al remate',
    description: 'Pasás directo al detalle, con la misma sala y las mismas pujas que cualquier remate.',
  },
] as const;

/** Extrae el UUID de remate de una URL pegada con la forma `.../remates/<uuid>` (con o
 * sin `/sala` o segmentos extra al final) -- la empresa comparte la URL completa
 * (`PrivateAccessPanel`), no un ID suelto, así que el formulario pide lo mismo que
 * recibió y el parseo queda de este lado. Devuelve `null` si no matchea, para no pegarle
 * al backend con algo que obviamente no es una URL de remate válida. */
function extractRemateId(url: string): string | null {
  const match = url
    .trim()
    .match(/\/remates\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  return match ? match[1] : null;
}

/**
 * "Ingresar a remate privado" -- pantalla del sidebar del comprador para canjear la URL
 * + código que la empresa compartió fuera de banda (WhatsApp, email, etc.). Mismo patrón
 * que `OperatorClaimPage` ("Unirme como operador"), adaptado: dos campos (URL + código)
 * en vez de ID + código, y el destino final es el detalle del remate
 * (`/remates/:id`, el mismo que usa cualquier remate público) en vez de la Consola
 * Operativa.
 *
 * El mensaje de error ante cualquier fallo es siempre genérico -- ni este formulario ni
 * el backend (`RemateService.redeem_private_access`) distinguen "la URL no corresponde a
 * ningún remate", "el remate no es privado" o "el código es incorrecto": confirmar
 * cualquiera de esas distinciones filtraría información sobre remates que no deberían
 * ser descubribles (mismo criterio anti-enumeración que el 404 del detalle).
 *
 * Debajo del formulario, `useMyPrivateAccessGrants` trae los remates que el usuario YA
 * canjeó antes (`GET /remates/private/mine`) -- si perdió la sesión o cerró la pestaña
 * sin guardar la URL, el grant (`RemateAccessGrant`) sigue vigente y esta sección se la
 * muestra de nuevo, con `RemateCard` reusado tal cual (su botón ya navega al detalle,
 * que funciona directo gracias al grant, sin volver a pedir el código).
 */
export function RedeemPrivateAccessPage() {
  useWideLayout();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { remates: grantedRemates, isLoading: isLoadingGrants } = useMyPrivateAccessGrants();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRedeemError(null);

    const remateId = extractRemateId(url);
    if (!remateId) {
      setRedeemError('Pegá la URL completa que te compartió la empresa.');
      return;
    }

    setIsSubmitting(true);
    try {
      const remate = await redeemPrivateAccessRequest(remateId, code.trim());
      navigate(`/remates/${remate.id}`);
    } catch {
      // Mensaje genérico a propósito, sin inspeccionar el error -- ver docstring del
      // componente (anti-enumeración).
      setRedeemError('URL o código inválido.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex flex-1 flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Ingresar a remate privado
            </h1>
            <p className="mt-2 max-w-xl text-sm text-ink-muted">
              Pegá la URL del remate y el código de acceso que te compartió la empresa
              organizadora.
            </p>
          </div>

          {REDEEM_STEPS.map((step, index) => (
            <div key={step.title} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                {index + 1}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                <p className="mt-1 max-w-sm text-sm text-ink-muted">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="w-full lg:w-[380px] lg:shrink-0">
          <Card>
            <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <KeyRound aria-hidden="true" className="h-5 w-5" />
            </div>
            <h2 className="mb-4 text-base font-semibold text-ink">Datos de acceso</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {redeemError && <Alert variant="error">{redeemError}</Alert>}

              <Input
                label="URL del remate"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Lo comparte la empresa junto con el código"
              />

              <Input
                label="Código de acceso"
                required
                icon={KeyRound}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Ej: A3K7P2QXHT"
              />

              <Button type="submit" isLoading={isSubmitting} disabled={!url.trim() || !code.trim()}>
                Entrar al remate
              </Button>
            </form>

            <p className="mt-3.5 text-center text-xs text-ink-muted">
              ¿No tenés una URL y un código? Pedíselos a la empresa que organiza el remate.
            </p>
          </Card>
        </div>
      </div>

      {(isLoadingGrants || grantedRemates.length > 0) && (
        <div className="flex flex-col gap-4 border-t border-line pt-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">Tus remates privados</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Remates a los que ya entraste antes -- volvé a entrar sin pegar el código de nuevo.
            </p>
          </div>
          <div className={CARD_GRID_CLASSES}>
            {isLoadingGrants
              ? Array.from({ length: GRANTS_SKELETON_COUNT }, (_, index) => (
                  <RemateCardSkeleton key={index} />
                ))
              : grantedRemates.map((remate) => <RemateCard key={remate.id} remate={remate} />)}
          </div>
        </div>
      )}
    </div>
  );
}
