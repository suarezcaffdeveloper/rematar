import { AlertTriangle, Bell, PackageCheck, type LucideIcon } from 'lucide-react';

/** Ícono por prefijo de `Notification.type` -- nuevos prefijos se agregan acá sin tocar
 * el resto del feature. Cualquier tipo no reconocido cae en el ícono genérico (`Bell`),
 * nunca rompe: el Notification Service puede agregar tipos nuevos sin coordinar con el
 * frontend (ver `app/notifications/repository.py`, `type` es texto libre). */
const ICON_BY_PREFIX: Array<[prefix: string, icon: LucideIcon]> = [
  ['postauction.', PackageCheck],
  ['moderacion.', AlertTriangle],
];

export function notificationIcon(type: string): LucideIcon {
  const match = ICON_BY_PREFIX.find(([prefix]) => type.startsWith(prefix));
  return match ? match[1] : Bell;
}
