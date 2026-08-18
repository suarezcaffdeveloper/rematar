import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { UsersIcon } from '../../remates/components/icons';

export interface PresenceCounterProps {
  count: number;
}

/**
 * Contador de conectados, con una transición suave cuando el número cambia (Épica 6,
 * Módulo 6.2) -- reemplaza el `<span>` estático que antes duplicaban `SalaHeader`
 * (comprador) y `ConsolaHeader` (rematador), ambos cross-feature igual que ya hace
 * `ConnectionStatusBadge` (mismo precedente: un componente de `features/sala/` con
 * doble consumidor desde el día 1). Ahora se actualiza evento a evento
 * (`presencia.usuario_conectado`/`desconectado`, ver `realtime/reducer.ts`), no solo
 * en cada reconexión.
 */
export function PresenceCounter({ count }: PresenceCounterProps) {
  const [isPulsing, setIsPulsing] = useState(false);
  const previousCount = useRef(count);

  useEffect(() => {
    if (previousCount.current === count) return;
    previousCount.current = count;
    setIsPulsing(true);
    const timeout = setTimeout(() => setIsPulsing(false), 300);
    return () => clearTimeout(timeout);
  }, [count]);

  return (
    <span
      className={clsx(
        'flex items-center gap-1.5 font-medium text-ink-muted transition-colors duration-300',
        isPulsing && 'text-brand-600',
      )}
    >
      <UsersIcon className="h-4 w-4 shrink-0 text-ink-faint" />
      {count} {count === 1 ? 'conectado' : 'conectados'}
    </span>
  );
}
