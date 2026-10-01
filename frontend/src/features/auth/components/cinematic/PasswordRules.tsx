import { Check, Circle } from 'lucide-react';

const RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: '8 caracteres o más', test: (v) => v.length >= 8 },
  { label: 'Mayúscula y minúscula', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'Un número', test: (v) => /\d/.test(v) },
  { label: 'Un símbolo', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/**
 * Barra de seguridad + reglas que se tildan a medida que se escribe, para el panel de vidrio
 * del registro. Mismos criterios que tenía el viejo medidor de seguridad; es puramente informativo, no
 * bloquea el envío (eso lo siguen decidiendo `minLength` y el backend).
 */
export function PasswordRules({ password }: { password: string }) {
  const score = RULES.filter((rule) => rule.test(password)).length;
  const barColor = score <= 1 ? 'bg-danger-400' : score === 2 ? 'bg-warning-400' : 'bg-success-400';

  return (
    <div>
      <div className="flex gap-1.5" aria-hidden="true">
        {RULES.map((rule, i) => (
          <span
            key={rule.label}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < score ? barColor : 'bg-white/15'}`}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {RULES.map((rule) => {
          const passed = rule.test(password);
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-2 text-xs transition-colors ${passed ? 'text-success-400' : 'text-white/50'}`}
            >
              {passed ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Circle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-white/25" />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
