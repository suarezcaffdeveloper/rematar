import { useState } from 'react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { useAuth } from '../../auth/hooks';
import { ActivitySection } from '../components/ActivitySection';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { EditProfileModal } from '../components/EditProfileModal';
import { AccountSection, PersonalDataSection } from '../components/ProfileInfoSections';
import { ProfileHeaderSection } from '../components/ProfileHeaderSection';
import { SecuritySection } from '../components/SecuritySection';
import { MOCK_BUYER_ACTIVITY } from '../mockActivity';

/**
 * "Mi perfil" (rediseño editorial) -- accesible desde el avatar/nombre de la barra superior,
 * disponible para cualquier rol autenticado. `useTopNavLayout()` pide la barra superior, que
 * muestra las opciones del rol de quien entra (`NAV_ITEMS_BY_ROLE`), y deja que la página arme
 * su propio contenedor. Cabecera con el nombre como titular y tres secciones en dos columnas
 * (Datos personales, Seguridad, Cuenta), separadas por líneas en vez de tarjetas; "Editar
 * perfil" y "Cambiar contraseña" abren modales con el mismo estilo.
 *
 * La franja de actividad es específica del comprador (remates participados, ofertas, lotes
 * adjudicados, total adjudicado solo tienen sentido para ese rol); el resto de los roles no
 * la ve, en vez de inventar métricas que el diseño nunca definió para ellos.
 */
export function ProfilePage() {
  useTopNavLayout();
  const { user } = useAuth();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Mi perfil' }]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[76rem] px-3 pb-32 pt-14 sm:px-6 lg:px-10">
        <ProfileHeaderSection user={user} onEditProfile={() => setIsEditProfileOpen(true)} />

        {user.role === 'comprador' && <ActivitySection stats={MOCK_BUYER_ACTIVITY} />}

        <PersonalDataSection user={user} onEditProfile={() => setIsEditProfileOpen(true)} />
        <SecuritySection onChangePassword={() => setIsChangePasswordOpen(true)} />
        <AccountSection user={user} />
      </div>

      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} user={user} />
      <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
    </div>
  );
}
