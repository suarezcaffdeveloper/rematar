import { Check } from 'lucide-react';

/** Pasos reales del flujo de recuperación: pedir el link, abrirlo desde el mail y elegir la contraseña nueva. */
const STEPS = [
  'Ingresás el email de tu cuenta',
  'Te enviamos un link por email',
  'Elegís una contraseña nueva',
];

/**
 * Columna izquierda de `ForgotPasswordPage` y `ResetPasswordPage`: los tres pasos del flujo
 * con el actual resaltado (`current`, base 0), los anteriores tildados y los siguientes tenues.
 */
export function RecoverySteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="mt-12 flex max-w-md flex-col gap-5" aria-label="Cómo funciona">
      {STEPS.map((step, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className={`flex items-center gap-4 text-[17px] transition-colors duration-500 ${
              isCurrent ? 'text-white' : isDone ? 'text-white/70' : 'text-white/40'
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ring-1 transition-colors duration-500 ${
                isCurrent ? 'bg-white text-ink ring-white' : isDone ? 'bg-white/15 text-white ring-white/40' : 'ring-white/25'
              }`}
            >
              {isDone ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}
