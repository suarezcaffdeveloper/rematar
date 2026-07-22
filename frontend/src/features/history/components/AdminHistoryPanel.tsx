import { FinishedRemateList } from './FinishedRemateList';

/** Pestaña "Historial" del panel de administrador (Épica 7, Módulo 7.3), en `/admin` --
 * `FinishedRemateList` con `showOwner` para distinguir de quién es cada remate, ya que
 * acá el backend (`HistoryService.list_finished`) devuelve la vista global. */
export function AdminHistoryPanel() {
  return <FinishedRemateList showOwner />;
}
