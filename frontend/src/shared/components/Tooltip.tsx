import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import clsx from 'clsx';

export interface TooltipProps {
  content: ReactNode;
  /** Único elemento disparador -- se le agregan los handlers de hover/foco y
   * `aria-describedby` vía `cloneElement`, sin que quien lo usa tenga que cablearlos. */
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const SHOW_DELAY_MS = 300;

const SIDE_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

function composeHandler<E>(existing: unknown, next: (event: E) => void) {
  return (event: E) => {
    if (typeof existing === 'function') existing(event);
    next(event);
  };
}

/**
 * Tooltip genérico (Épica 9, Etapa 1 -- rediseño, no existía antes en el sistema de
 * diseño). Posicionamiento simple con CSS -- sin `@floating-ui`, sin detección de
 * colisión con los bordes de la ventana -- alcanza para textos cortos sobre íconos o
 * botones, mismo criterio de "no construir de más" que ya aplica `Modal` (sin trap de
 * foco) en este proyecto. Se muestra por hover Y por foco de teclado (nunca solo por
 * hover), para no esconder contenido de quien navega sin mouse.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  const timeoutRef = useRef<number | undefined>(undefined);

  function show() {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setIsOpen(true), SHOW_DELAY_MS);
  }

  function hide() {
    window.clearTimeout(timeoutRef.current);
    setIsOpen(false);
  }

  if (!isValidElement(children)) return children;

  const childProps = children.props as Record<string, unknown>;
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': isOpen ? tooltipId : undefined,
    onMouseEnter: composeHandler<MouseEvent>(childProps.onMouseEnter, show),
    onMouseLeave: composeHandler<MouseEvent>(childProps.onMouseLeave, hide),
    onFocus: composeHandler<FocusEvent>(childProps.onFocus, show),
    onBlur: composeHandler<FocusEvent>(childProps.onBlur, hide),
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {isOpen && (
        <span
          role="tooltip"
          id={tooltipId}
          className={clsx(
            'pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg transition-opacity duration-100',
            SIDE_CLASSES[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
