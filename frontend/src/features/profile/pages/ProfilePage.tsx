import { useState } from 'react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useAuth } from '../../auth/hooks';
import { ActivitySection } from '../components/ActivitySection';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { EditProfileModal } from '../components/EditProfileModal';
import { ProfileHeaderSection } from '../components/ProfileHeaderSection';
import { SecuritySection } from '../components/SecuritySection';
import { MOCK_BUYER_ACTIVITY } from '../mockActivity';

/**
 * "Mi perfil" -- accesible desde el avatar/nombre del pie del sidebar (`Sidebar.tsx`).
 * Tres secciones (Perfil, Seguridad, Mi actividad) apiladas en una única columna
 * angosta, separadas por espacio en blanco y divisores sutiles en vez de tarjetas --
 * pedido explícito de diseño: que se sienta como la pantalla de configuración de un
 * producto SaaS moderno, no como otro dashboard.
 *
 * "Mi actividad" es específica del comprador (los cuatro indicadores que pidió el
 * diseño -- remates participados, ofertas, lotes adjudicados, total adjudicado -- solo
 * tienen sentido para ese rol); rematador/admin no la ven, en vez de inventar métricas
 * que el diseño nunca definió para ellos.
 */
export function ProfilePage() {
  const { user } = useAuth();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Mi perfil' }]);

  if (!user) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Mi perfil</h1>
        <p className="mt-1 text-sm text-slate-500">Tu información personal, seguridad y actividad en RematAR.</p>
      </div>

      <ProfileHeaderSection user={user} onEditProfile={() => setIsEditProfileOpen(true)} />

      <div className="border-t border-slate-100 pt-10">
        <SecuritySection onChangePassword={() => setIsChangePasswordOpen(true)} />
      </div>

      {user.role === 'comprador' && (
        <div className="border-t border-slate-100 pt-10">
          <ActivitySection stats={MOCK_BUYER_ACTIVITY} />
        </div>
      )}

      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} user={user} />
      <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
    </div>
  );
}
