import { Card } from '../../../shared/components/Card';
import { FileTextIcon } from '../../remates/components/icons';

/** "Documentación" (sección 11) -- espacio visual preparado para una etapa futura
 * (comprobante de pago, factura, documentación de envío/entrega). Sin funcionalidad real
 * todavía: pedido explícito de no implementar nada complejo en esta pasada. */
export function DocumentationPlaceholder() {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <FileTextIcon className="h-5 w-5" />
      </span>
      <h2 className="text-sm font-semibold text-slate-900">Documentación</h2>
      <p className="max-w-xs text-xs text-slate-500">
        Próximamente vas a poder adjuntar comprobante de pago, factura y documentación de
        envío y entrega acá.
      </p>
    </Card>
  );
}
