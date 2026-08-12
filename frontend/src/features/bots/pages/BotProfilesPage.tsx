import { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useToastStore } from '../../../shared/toast/toastStore';
import { deleteBotProfileRequest } from '../api';
import { BotProfileCard } from '../components/BotProfileCard';
import { BotProfileFormModal } from '../components/BotProfileFormModal';
import { useBotProfiles } from '../hooks';
import type { BotProfile } from '../types';

const BREADCRUMB_ITEMS = [{ label: 'Simuladores' }];

/**
 * Gestión global de "Simuladores de compradores" (módulo de Bots Simuladores) --
 * CRUD de perfiles reutilizables entre remates. La selección de qué bots participan en
 * un remate puntual y el control Iniciar/Pausar/Detener viven en `ConsolaBotsPanel`,
 * dentro de la Consola Operativa de cada remate, no acá.
 */
export function BotProfilesPage() {
  useBreadcrumb(BREADCRUMB_ITEMS);
  const { bots, isLoading, error, reload } = useBotProfiles();
  const [formState, setFormState] = useState<{ mode: 'create' } | { mode: 'edit'; bot: BotProfile } | null>(null);
  const [deletingBot, setDeletingBot] = useState<BotProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!deletingBot) return;
    setIsDeleting(true);
    try {
      await deleteBotProfileRequest(deletingBot.id);
      useToastStore.getState().push('success', 'Simulador eliminado.');
      setDeletingBot(null);
      reload();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Simuladores de compradores</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bots configurables para probar y demostrar tus remates con competencia realista.
          </p>
        </div>
        <Button onClick={() => setFormState({ mode: 'create' })}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Crear simulador
        </Button>
      </div>

      {error && <Alert variant="error">{error.message}</Alert>}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : bots.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-8 w-8" />}
          title="Todavía no creaste ningún simulador"
          description="Creá bots con distinta personalidad y presupuesto para probar tus remates con competencia realista antes de una demostración."
          action={<Button onClick={() => setFormState({ mode: 'create' })}>Crear el primero</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <BotProfileCard
              key={bot.id}
              bot={bot}
              onEdit={(selected) => setFormState({ mode: 'edit', bot: selected })}
              onDelete={setDeletingBot}
            />
          ))}
        </div>
      )}

      <BotProfileFormModal
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        bot={formState?.mode === 'edit' ? formState.bot : undefined}
        onSaved={reload}
      />

      <ConfirmModal
        isOpen={deletingBot !== null}
        onClose={() => setDeletingBot(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Eliminar simulador"
        message={`¿Eliminar "${deletingBot?.display_name}"? No vas a poder seleccionarlo en nuevos remates.`}
        confirmLabel={isDeleting ? 'Eliminando…' : 'Eliminar'}
      />
    </div>
  );
}
