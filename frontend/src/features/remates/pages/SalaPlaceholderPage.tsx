import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';

/**
 * Destino del botón "Entrar al remate" de `RemateDetailPage` (Épica 4, Módulo 4.4). La
 * sala del remate en vivo (WebSocket, ofertas, chat, video, snapshot inicial) es un
 * módulo futuro -- ver "No implementar todavía" en el pedido de ese módulo. Vive en su
 * propia ruta (`/remates/:remateId/sala`, distinta de `/remates/:remateId`, que ahora es
 * la página de detalle real) para que integrar la sala real el día de mañana sea
 * reemplazar este componente, sin tocar ni la ruta de detalle ni cómo se llega hasta acá.
 */
export function SalaPlaceholderPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">Sala del remate</h1>
      <p className="mt-2 text-sm text-slate-600">
        Remate <code className="rounded bg-slate-100 px-1">{remateId}</code>. La sala en vivo
        (WebSocket, ofertas, chat, video) es un módulo futuro.
      </p>
      <Button variant="secondary" className="mt-4" onClick={() => navigate(`/remates/${remateId}`)}>
        Volver al detalle del remate
      </Button>
    </Card>
  );
}
