import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import clsx from 'clsx';
import { formatDateTime } from '../../../shared/lib/format';
import { useAuth } from '../../auth/hooks';
import { useNotifications, useUnreadNotificationCount } from '../hooks';
import { notificationIcon } from '../labels';
import { notificationHref } from '../routing';
import type { Notification } from '../types';

const RECENT_COUNT = 8;

const ARROW_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * Campana de notificaciones (Épica 9, Etapa 3 -- rediseño), montada una única vez en
 * `Header`. Primer consumo real del Notification Service (Épica 7.5) desde el
 * frontend. Mismo patrón de interacción que `DropdownMenu` (cierre por click-afuera/
 * Escape) pero con contenido propio -- el modelo de `DropdownMenu` (lista de
 * label+onSelect) no encaja con filas de notificación (ícono, título, mensaje, fecha,
 * link opcional al remate).
 *
 * Navegación por teclado (Épica 9, Etapa 7 -- rediseño, accesibilidad final): mismo
 * tratamiento que `DropdownMenu` -- ↑/↓/Home/End recorren las filas, Escape cierra y
 * devuelve el foco a la campana.
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { unreadCount, reload: reloadUnreadCount } = useUnreadNotificationCount();
  const { data, isLoading, markAsRead, markAllAsRead } = useNotifications(RECENT_COUNT);
  const { user } = useAuth();

  function close(restoreFocus: boolean) {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;

    function focusableRows(): HTMLElement[] {
      return Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a, button') ?? []);
    }

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close(true);
        return;
      }
      if (!ARROW_KEYS.includes(event.key)) return;
      event.preventDefault();
      const rows = focusableRows();
      if (rows.length === 0) return;
      const currentIndex = rows.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? rows.length - 1
            : event.key === 'ArrowDown'
              ? (currentIndex + 1) % rows.length
              : (currentIndex - 1 + rows.length) % rows.length;
      rows[nextIndex]?.focus();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function handleItemActivate(notification: Notification) {
    close(false);
    if (notification.read_at === null) {
      void markAsRead(notification.id).then(reloadUnreadCount);
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    reloadUnreadCount();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Notificaciones"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="relative rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="region"
          aria-label="Notificaciones"
          className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notificaciones</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">Cargando…</p>
            ) : !data || data.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">No tenés notificaciones.</p>
            ) : (
              <ul>
                {data.items.map((notification) => {
                  const Icon = notificationIcon(notification.type);
                  const isUnread = notification.read_at === null;
                  const rowContent = (
                    <div className={clsx('flex gap-3 px-4 py-3 text-left text-sm', isUnread && 'bg-brand-50/50')}>
                      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{notification.title}</p>
                        <p className="mt-0.5 text-ink-muted">{notification.message}</p>
                        <p className="mt-1 text-xs text-ink-faint">{formatDateTime(notification.created_at)}</p>
                      </div>
                      {isUnread && (
                        <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </div>
                  );

                  const href = notificationHref(notification, user?.role);

                  return (
                    <li key={notification.id} className="border-b border-line last:border-0">
                      {href ? (
                        <Link
                          to={href}
                          onClick={() => handleItemActivate(notification)}
                          className="block transition-colors hover:bg-surface-subtle"
                        >
                          {rowContent}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleItemActivate(notification)}
                          className="block w-full transition-colors hover:bg-surface-subtle"
                        >
                          {rowContent}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
