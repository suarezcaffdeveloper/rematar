import { type KeyboardEvent, useRef } from 'react';
import clsx from 'clsx';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

/**
 * Selector de pestañas genérico (Épica 9, Etapa 5 -- rediseño), extraído del patrón que
 * `AdminAuditLogPage.tsx` ya usaba a mano (Épica 7.2) -- mismo look, ahora compartido.
 * Solo dibuja la lista de pestañas (`role="tablist"`); el contenido de cada una lo
 * decide quien lo usa (no hay un `TabPanel` acoplado) para no forzar cómo se monta/
 * desmonta cada panel.
 *
 * Tabindex "roving" + flechas (Épica 9, Etapa 7 -- rediseño, accesibilidad final):
 * patrón ARIA de pestañas -- solo la pestaña activa es alcanzable por Tab
 * (`tabIndex={0}`, el resto `-1`), ←/→ (Home/End para ir al extremo) mueven el foco y
 * seleccionan la pestaña, con wraparound en las puntas.
 */
export function Tabs({ tabs, activeId, onChange, className }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ARROW_KEYS.includes(event.key)) return;
    event.preventDefault();

    const currentIndex = tabs.findIndex((tab) => tab.id === activeId);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;

    onChange(tabs[nextIndex].id);
    containerRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={clsx('flex gap-5 border-b border-line', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          tabIndex={activeId === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'border-b-2 pb-2.5 text-xs font-semibold uppercase tracking-wide transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
            activeId === tab.id
              ? 'border-brand-600 text-ink'
              : 'border-transparent text-ink-faint hover:text-ink-muted',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
