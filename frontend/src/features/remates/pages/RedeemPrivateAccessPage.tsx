import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { redeemPrivateAccessRequest } from '../api';
import { GrantedRemates } from '../components/privado/GrantedRemates';
import { RedeemForm } from '../components/privado/RedeemForm';
import { RedeemHowTo } from '../components/privado/RedeemHowTo';
import { useMyPrivateAccessGrants } from '../hooks';
import type { Remate } from '../types';

/**
 * "Ingresar a remate privado" -- pantalla del nav del comprador para canjear la URL
 * + código que la empresa compartió fuera de banda (WhatsApp, email, etc.). Mismo patrón
 * que `OperatorClaimPage` ("Unirme como operador"), adaptado: dos campos (URL + código)
 * en vez de ID + código, y el destino final es el detalle del remate
 * (`/remates/:id`, el mismo que usa cualquier remate público) en vez de la Consola
 * Operativa.
 *
 * Rediseño "paso a paso" (mismo lenguaje visual que el inicio y "Mis compras"):
 * `RedeemForm` habilita de a un campo (URL validada al pegarla, después el código),
 * `RedeemHowTo` deja los tres pasos explicativos al costado y `GrantedRemates` muestra
 * debajo los remates que el usuario YA canjeó antes (`useMyPrivateAccessGrants`). El
 * mensaje de error ante cualquier fallo del canje es siempre genérico (anti-enumeración,
 * ver `GENERIC_REDEEM_ERROR`). `useTopNavLayout()` le pide a `AppLayout` la barra
 * superior `BuyerTopNav` en lugar de `Sidebar` + `Header`.
 */
export function RedeemPrivateAccessPage() {
  useTopNavLayout();
  const navigate = useNavigate();
  const { remates: grantedRemates, isLoading: isLoadingGrants } = useMyPrivateAccessGrants();

  const enter = useCallback((remate: Remate) => navigate(`/remates/${remate.id}`), [navigate]);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="mb-12">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Ingresar a remate privado
          </h1>
          <p className="mt-5 max-w-md text-ink-muted">
            Pegá la URL del remate y el código de acceso que te compartió la empresa organizadora.
          </p>
        </header>

        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-24">
          <RedeemForm redeem={redeemPrivateAccessRequest} onEnter={enter} />
          <RedeemHowTo />
        </div>

        {(isLoadingGrants || grantedRemates.length > 0) && (
          <GrantedRemates remates={grantedRemates} isLoading={isLoadingGrants} />
        )}
      </div>
    </div>
  );
}
