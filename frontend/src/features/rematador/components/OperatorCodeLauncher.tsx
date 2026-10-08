import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { Remate } from '../../remates/types';
import { OperatorCodeDrawer } from './OperatorCodeDrawer';

/**
 * Fila Editorial de la pantalla de gestión previa al inicio: dice en qué estado está el
 * código del martillero y abre el mismo panel lateral que el dashboard
 * (`OperatorCodeDrawer`). Reemplaza a la franja `OperatorCodePanel` en ese contexto; la
 * variante "popover" de ese componente sigue viva dentro de la consola en vivo.
 */
export function OperatorCodeLauncher({ remate, onChanged }: { remate: Remate; onChanged?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const assigned = Boolean(remate.rematador_id);
  const generated = Boolean(remate.operator_code_generated_at);
  const status = assigned ? 'Operador asignado' : generated ? 'Código generado, esperando al martillero' : 'Falta generar el código';
  const tone = assigned ? 'text-success-700' : generated ? 'text-brand-700' : 'text-warning-700';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-y border-line py-4">
        <KeyRound aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Código para el martillero</p>
          <p className={`text-sm font-semibold ${tone}`}>{status}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            assigned || generated
              ? 'border border-line-strong bg-white text-ink hover:border-ink'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {assigned || generated ? 'Gestionar código' : 'Generar código'}
        </button>
      </div>
      <OperatorCodeDrawer remate={remate} isOpen={isOpen} onClose={() => setIsOpen(false)} onGenerated={onChanged} />
    </>
  );
}
