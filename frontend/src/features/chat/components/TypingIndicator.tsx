import type { TypingUser } from '../types';

export interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

/** "Fulano está escribiendo..." / "Fulano y Mengano están escribiendo..." /
 * "3 personas están escribiendo..." -- espacio reservado siempre montado (altura fija)
 * para que aparecer/desaparecer no empuje el resto del panel. */
export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  return (
    <div className="h-5 px-3 text-xs text-slate-400">
      {typingUsers.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="flex gap-0.5" aria-hidden="true">
            <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400" />
          </span>
          {describeTypingUsers(typingUsers)}
        </span>
      )}
    </div>
  );
}

function describeTypingUsers(typingUsers: TypingUser[]): string {
  if (typingUsers.length === 1) {
    return `${typingUsers[0].user_name} está escribiendo...`;
  }
  if (typingUsers.length === 2) {
    return `${typingUsers[0].user_name} y ${typingUsers[1].user_name} están escribiendo...`;
  }
  return `${typingUsers.length} personas están escribiendo...`;
}
