import { Modal } from '../../../shared/components/Modal';
import { PrivateAccessCredentials } from './PrivateAccessCredentials';
import type { Remate } from '../../remates/types';

export interface PrivateAccessCredentialsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  remate: Remate;
}

/**
 * Popover del botón "Copiar credenciales" en `RematadorRemateCard` -- deja a la empresa
 * copiar la URL + código de un remate privado directo desde el dashboard, ANTES de
 * iniciarlo, sin tener que entrar a la Consola Operativa (que además, para un remate
 * `draft`/`scheduled`, no tiene ningún link de navegación en la card). Mismo componente
 * `PrivateAccessCredentials` que usa `PrivateAccessPanel` en la sala en vivo -- mismo
 * código en los dos lugares, nunca "otro" generado aparte.
 */
export function PrivateAccessCredentialsPopover({
  isOpen,
  onClose,
  remate,
}: PrivateAccessCredentialsPopoverProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Credenciales de acceso privado">
      <PrivateAccessCredentials remate={remate} />
    </Modal>
  );
}
