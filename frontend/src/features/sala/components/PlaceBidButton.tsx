import { Button } from '../../../shared/components/Button';

/**
 * Placeholder deliberado (Épica 4.5: "No implementar todavía... WebSockets"). Aislado
 * en su propio componente a propósito: el módulo que agregue ofertas en tiempo real
 * reemplaza únicamente este archivo (o lo que hay dentro de él) por el formulario real
 * -- `ActiveLotePanel` no necesita cambiar, solo sigue renderizando lo que este
 * componente devuelva. Ver docs/27-sala-del-remate.md, "Preparación para WebSockets".
 */
export function PlaceBidButton() {
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
      <Button disabled className="w-full sm:w-auto" title="Disponible en el próximo módulo">
        Realizar oferta
      </Button>
      <p className="text-xs text-slate-400">
        La integración de ofertas en tiempo real se implementará en el siguiente módulo.
      </p>
    </div>
  );
}
