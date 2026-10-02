import { useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CornerDownRight, Send, X } from 'lucide-react';
import { ChatPanel, OfferList, ago } from '../previewConsola/shared';
import type { BuyerQuestion, EmpresaSim } from './sim';

/** Respuestas que se repiten en casi todos los remates: un toque y se manda. */
const QUICK_REPLIES = [
  'Sí, está incluido.',
  'Se retira en el lugar, coordinando con la empresa.',
  'Consultalo en la descripción del lote.',
  'Lo confirmamos en un momento.',
];

function QuestionCard({ question, sim, now }: { question: BuyerQuestion; sim: EmpresaSim; now: number }) {
  const [draft, setDraft] = useState('');
  const seconds = Math.max(0, Math.floor((now - question.at) / 1000));
  const send = (text: string) => {
    if (!text.trim()) return;
    sim.answerQuestion(question.id, text);
    setDraft('');
  };

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2 text-xs text-ink-muted">
            <span className="font-semibold text-ink">{question.author}</span>
            <span className="tabular-nums">{ago(seconds)}</span>
          </p>
          <p className="mt-1 text-sm font-medium leading-snug text-ink">{question.text}</p>
        </div>
        <button
          type="button"
          onClick={() => sim.dismissQuestion(question.id)}
          aria-label="Descartar pregunta"
          title="Descartar (no requiere respuesta)"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => send(reply)}
            className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {reply}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Responder a ${question.author}`}
          placeholder="Escribí tu respuesta"
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Enviar respuesta"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </motion.li>
  );
}

/** Bandeja de preguntas de compradores: las pendientes primero, con respuesta rápida; abajo, las ya respondidas. */
export function QuestionsInbox({ sim }: { sim: EmpresaSim }) {
  const pending = sim.pendingQuestions;
  const answered = sim.questions.filter((q) => q.answer !== null).slice(-4).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      {pending.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-success-50 px-4 py-3 text-sm text-success-700">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          No hay preguntas sin responder.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {pending
              .slice()
              .reverse()
              .map((q) => (
                <QuestionCard key={q.id} question={q} sim={sim} now={sim.now} />
              ))}
          </AnimatePresence>
        </ul>
      )}

      {answered.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Respondidas</h3>
          <ul className="mt-2 divide-y divide-line">
            {answered.map((q) => (
              <li key={q.id} className="py-3 text-sm">
                <p className="text-ink-muted">
                  <span className="font-medium text-ink">{q.author}:</span> {q.text}
                </p>
                <p className="mt-1 flex gap-1.5 text-ink">
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                  {q.answer?.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type RailTab = 'preguntas' | 'chat';

/**
 * Columna derecha fija de la cabina, visible desde cualquier pestaña: ofertas en vivo arriba y,
 * abajo, las preguntas de los compradores (lo que la empresa responde) y el chat completo con
 * moderación. Un comprador que pregunta no debería esperar porque la empresa estaba en otra pestaña.
 */
export function ChatRail({ sim }: { sim: EmpresaSim }) {
  const [tab, setTab] = useState<RailTab>('preguntas');
  const pending = sim.pendingQuestions.length;

  return (
    <div id="pe-rail" className="flex min-h-0 flex-col gap-6">
      <OfferList sim={sim} className="h-[14.5rem] shrink-0" />
      <div className="flex min-h-[28rem] flex-1 flex-col xl:min-h-0">
        <div role="tablist" aria-label="Preguntas y chat" className="flex shrink-0 gap-5 border-b border-line">
          {(
            [
              ['preguntas', 'Preguntas', pending],
              ['chat', 'Chat y moderación', 0],
            ] as [RailTab, string, number][]
          ).map(([id, label, badge]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                '-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                tab === id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {label}
              {badge > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 text-xs font-semibold tabular-nums text-white">{badge}</span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          {tab === 'preguntas' ? <QuestionsInbox sim={sim} /> : <ChatPanel sim={sim} className="min-h-0 flex-1" />}
        </div>
      </div>
    </div>
  );
}
