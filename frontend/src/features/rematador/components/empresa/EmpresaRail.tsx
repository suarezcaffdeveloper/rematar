import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, CornerDownRight, Send, ShieldAlert, X } from 'lucide-react';
import { formatRelativeTime } from '../../../../shared/lib/format';
import { ChatPanel } from '../../../chat/components/ChatPanel';
import { ConnectedBuyersList } from '../../../moderation/components/ConnectedBuyersList';
import { LockChatButton } from '../../../moderation/components/LockChatButton';
import { RecentModerationActions } from '../../../moderation/components/RecentModerationActions';
import { isModerationDomainEventMessage } from '../../../moderation/realtime/events';
import { OfferHistoryPanel } from '../../../sala/components/OfferHistoryPanel';
import type { OfertaSnapshotEntry } from '../../../sala/types';
import type { BuyerQuestion, BuyerQuestions } from './useBuyerQuestions';

/** Respuestas que se repiten en casi todos los remates: un toque y se manda. */
const QUICK_REPLIES = [
  'Sí, está incluido.',
  'Se retira en el lugar, coordinando con la empresa.',
  'Consultalo en la descripción del lote.',
  'Lo confirmamos en un momento.',
];

function QuestionCard({ question, buyerQuestions }: { question: BuyerQuestion; buyerQuestions: BuyerQuestions }) {
  const [draft, setDraft] = useState('');
  const { reply, dismiss, isSending } = buyerQuestions;

  const send = (text: string) => {
    if (!text.trim() || isSending) return;
    void reply(question, text)
      .then(() => setDraft(''))
      .catch(() => {
        // `sendError` ya queda en el hook; la pregunta sigue pendiente para reintentar.
      });
  };

  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2 text-xs text-ink-muted">
            <span className="font-semibold text-ink">{question.authorName}</span>
            <span className="tabular-nums">{formatRelativeTime(question.createdAt)}</span>
          </p>
          <p className="mt-1 break-words text-sm font-medium leading-snug text-ink">{question.text}</p>
        </div>
        <button
          type="button"
          onClick={() => dismiss(question.id)}
          aria-label="Descartar pregunta"
          title="Descartar (no requiere respuesta)"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((quick) => (
          <button
            key={quick}
            type="button"
            disabled={isSending}
            onClick={() => send(quick)}
            className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
          >
            {quick}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          aria-label={`Responder a ${question.authorName}`}
          placeholder="Escribí tu respuesta"
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label="Enviar respuesta"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </li>
  );
}

function QuestionsInbox({ buyerQuestions }: { buyerQuestions: BuyerQuestions }) {
  const { pending, questions, sendError } = buyerQuestions;
  const answered = questions.filter((q) => q.answer !== null).slice(-4).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      {pending.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-success-50 px-4 py-3 text-sm text-success-700">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          No hay preguntas sin responder.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending
            .slice()
            .reverse()
            .map((question) => (
              <QuestionCard key={question.id} question={question} buyerQuestions={buyerQuestions} />
            ))}
        </ul>
      )}

      {sendError && (
        <p role="alert" className="mt-3 text-sm text-danger-600">
          {sendError.message}
        </p>
      )}

      {answered.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Respondidas</h3>
          <ul className="mt-2 divide-y divide-line">
            {answered.map((question) => (
              <li key={question.id} className="py-3 text-sm">
                <p className="text-ink-muted">
                  <span className="font-medium text-ink">{question.authorName}:</span> {question.text}
                </p>
                <p className="mt-1 flex gap-1.5 text-ink">
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                  {question.answer}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type RailTab = 'preguntas' | 'chat' | 'conectados' | 'moderacion';

export interface EmpresaRailProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currentUserId: string | undefined;
  connectedUsers: number;
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
  buyerQuestions: BuyerQuestions;
}

/**
 * Columna derecha de la consola de la empresa, visible desde cualquier pestaña: ofertas en
 * vivo arriba y, abajo, las preguntas de los compradores (lo que la empresa responde), el
 * chat completo, los conectados y la moderación -- los mismos paneles que ya usaba
 * `ConsolaSidebar`, ahora con la bandeja de preguntas como pestaña por defecto.
 */
export function EmpresaRail({
  remateId,
  subscribeToRealtime,
  currentUserId,
  connectedUsers,
  winningOffer,
  recentOffers,
  currency,
  buyerQuestions,
}: EmpresaRailProps) {
  const [tab, setTab] = useState<RailTab>('preguntas');
  const [reloadToken, setReloadToken] = useState(0);
  const pendingCount = buyerQuestions.pending.length;

  useEffect(() => {
    const unsubscribe = subscribeToRealtime((raw) => {
      if (!isModerationDomainEventMessage(raw)) return;
      setReloadToken((token) => token + 1);
    });
    return unsubscribe;
  }, [subscribeToRealtime]);

  const tabs: Array<[RailTab, string]> = [
    ['preguntas', 'Preguntas'],
    ['chat', 'Chat'],
    ['conectados', 'Conectados'],
    ['moderacion', 'Moderación'],
  ];

  return (
    <div id="empresa-rail" className="flex min-h-0 flex-col gap-6">
      <OfferHistoryPanel winningOffer={winningOffer} recentOffers={recentOffers} currency={currency} />

      <div className="flex min-h-[28rem] flex-1 flex-col xl:min-h-0">
        <div role="tablist" aria-label="Preguntas, chat y moderación" className="flex shrink-0 gap-4 overflow-x-auto border-b border-line">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                tab === id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {label}
              {id === 'preguntas' && pendingCount > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 text-xs font-semibold tabular-nums text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          {tab === 'preguntas' && <QuestionsInbox buyerQuestions={buyerQuestions} />}
          {tab === 'chat' && (
            <ChatPanel
              remateId={remateId}
              subscribeToRealtime={subscribeToRealtime}
              currentUserId={currentUserId}
              connectedUsers={connectedUsers}
              canModerate
              chrome="flat"
              className="min-h-0 flex-1"
            />
          )}
          {tab === 'conectados' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ConnectedBuyersList remateId={remateId} reloadToken={reloadToken} />
            </div>
          )}
          {tab === 'moderacion' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between rounded-xl border border-line bg-white p-3 shadow-sm">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ShieldAlert aria-hidden="true" className="h-4 w-4 text-ink-faint" />
                  Moderación
                </span>
                <LockChatButton remateId={remateId} onLocked={() => setReloadToken((token) => token + 1)} />
              </div>
              <RecentModerationActions remateId={remateId} key={reloadToken} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
