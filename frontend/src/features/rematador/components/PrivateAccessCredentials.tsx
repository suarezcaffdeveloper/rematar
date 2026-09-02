import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCcw } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { useToastStore } from '../../../shared/toast/toastStore';
import { generatePrivateAccessCodeRequest, getPrivateAccessCodeRequest } from '../../remates/api';
import type { Remate } from '../../remates/types';

export interface PrivateAccessCredentialsProps {
  remate: Remate;
}

interface InlineCopyFieldProps {
  label: string;
  value: string;
  successMessage: string;
}

/** Mismo componente/interacción que `OperatorCodePanel::InlineCopyField` -- se duplica
 * acá (en vez de extraerlo a un compartido) porque hoy solo tiene consumidores dentro
 * de `rematador/components`; ver el mismo razonamiento en `OperatorCodePanel`. */
function InlineCopyField({ label, value, successMessage }: InlineCopyFieldProps) {
  const [justCopied, setJustCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setJustCopied(true);
      useToastStore.getState().push('success', successMessage);
      window.setTimeout(() => setJustCopied(false), 2000);
    } catch {
      // Portapapeles no disponible -- el dato ya está visible en pantalla.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-2.5 py-1.5">
      <span className="text-[11px] font-semibold text-ink-faint">{label}</span>
      <code className="max-w-[220px] truncate text-[13px] font-semibold text-ink">{value}</code>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="rounded p-0.5 text-ink-faint transition-colors hover:bg-slate-100 hover:text-ink-muted"
      >
        {justCopied ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-600" />
        ) : (
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function EmptyCodeField() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5">
      <span className="text-[11px] font-semibold text-ink-faint">Código de acceso</span>
      <span className="text-xs italic text-ink-faint">Sin generar</span>
    </div>
  );
}

/**
 * Credenciales de acceso privado de un remate (URL + código), compartidas entre
 * `PrivateAccessPanel` (franja dentro de la Consola Operativa) y
 * `PrivateAccessCredentialsPopover` (botón "Copiar credenciales" en la card del
 * dashboard, antes de iniciar el remate) -- mismo código, mismo componente, en vez de
 * la "generación separada" que existía antes de este cambio.
 *
 * Al montar, trae el código ACTUAL vía `getPrivateAccessCodeRequest` (nunca lo
 * regenera): es el mismo código devuelto una vez por `POST /remates` al crear el
 * remate, recuperable las veces que haga falta porque el backend lo persiste cifrado
 * (reversible, no hasheado -- ver `Remate.private_access_code_encrypted`). "Regenerar
 * código" sigue siendo una acción explícita y separada (invalida el código anterior
 * para quien todavía no lo canjeó; los compradores que ya canjearon no pierden acceso).
 */
export function PrivateAccessCredentials({ remate }: PrivateAccessCredentialsProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [code, setCode] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [justCopiedBoth, setJustCopiedBoth] = useState(false);
  const remateUrl = `${window.location.origin}/remates/${remate.id}`;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getPrivateAccessCodeRequest(remate.id)
      .then((response) => {
        if (cancelled) return;
        if (response) {
          setCode(response.code);
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        useToastStore.getState().push('error', normalizeApiError(err).message);
        setStatus('empty');
      });
    return () => {
      cancelled = true;
    };
  }, [remate.id]);

  async function handleGenerateOrRegenerateClick() {
    setIsRegenerating(true);
    try {
      const response = await generatePrivateAccessCodeRequest(remate.id);
      setCode(response.code);
      setStatus('ready');
      useToastStore.getState().push(
        'success',
        status === 'ready' ? 'Código regenerado.' : 'Código de acceso generado.',
      );
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsRegenerating(false);
    }
  }

  /** Copia URL + código juntos en un único JSON, listo para pegar tal cual en el canal
   * externo que la empresa elija (WhatsApp, email, etc.) -- pedido explícito del spec. */
  async function handleCopyBoth() {
    if (!code) return;
    const combined = JSON.stringify({ url: remateUrl, code });
    try {
      await navigator.clipboard.writeText(combined);
      setJustCopiedBoth(true);
      useToastStore.getState().push('success', 'URL y código copiados.');
      window.setTimeout(() => setJustCopiedBoth(false), 2000);
    } catch {
      // Portapapeles no disponible -- los datos ya están visibles en pantalla.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === 'ready' ? (
        <Badge variant="success">Código listo</Badge>
      ) : status === 'loading' ? (
        <Badge variant="brand">Cargando…</Badge>
      ) : (
        <Badge variant="warning">Falta generar</Badge>
      )}

      <InlineCopyField label="URL del remate" value={remateUrl} successMessage="URL copiada." />

      {status === 'ready' && code ? (
        <InlineCopyField label="Código de acceso" value={code} successMessage="Código copiado." />
      ) : (
        <EmptyCodeField />
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ink-outline"
          className="!gap-1.5 !px-2.5 !py-1.5 text-xs"
          onClick={() => void handleGenerateOrRegenerateClick()}
          isLoading={isRegenerating}
          disabled={status === 'loading'}
        >
          <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
          {status === 'ready' ? 'Regenerar código' : 'Generar código'}
        </Button>

        <Button
          variant="primary"
          className="!gap-1.5 !px-2.5 !py-1.5 text-xs"
          onClick={() => void handleCopyBoth()}
          disabled={status !== 'ready'}
        >
          {justCopiedBoth ? (
            <>
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              ¡Copiado!
            </>
          ) : (
            <>
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              Copiar datos
            </>
          )}
        </Button>
      </div>

      {status === 'ready' && (
        <p className="w-full text-xs text-ink-faint">
          Regenerar invalida este código para cualquiera que todavía no lo haya
          canjeado -- vas a tener que reenviarlo. No afecta a quien ya tiene acceso.
        </p>
      )}
    </div>
  );
}
